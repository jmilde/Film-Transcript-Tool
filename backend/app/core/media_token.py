"""Short-lived signed tokens granting read access to a video's media files.

A browser ``<video src>`` / ``<img src>`` cannot send an ``Authorization``
header, so the media-streaming routes cannot reuse the Bearer dependency. Instead
an *authorized* endpoint (which does require Bearer + project membership) mints a
short-lived HMAC-signed token scoped to a single video, and the media routes
accept it as a ``?token=`` query parameter. Possession of a valid, unexpired
token for a video is itself the proof of authorization — it can only have been
issued to a project member.
"""

import base64
import hashlib
import hmac
import time
import uuid

from app.config import get_settings
from app.core.errors import UnauthorizedError

# Default lifetime of a minted media token. Long enough to start and seek within
# a playback session, short enough that a leaked URL stops working quickly.
DEFAULT_TTL_SECONDS = 3600


def _sign(message: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def mint_media_token(video_id: uuid.UUID, *, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    """Issue a token authorizing read access to ``video_id`` until it expires."""
    exp = int(time.time()) + ttl_seconds
    payload = f"{video_id.hex}.{exp}"
    signature = _sign(payload, get_settings().media_token_secret)
    return f"{payload}.{signature}"


def verify_media_token(token: str, video_id: uuid.UUID) -> None:
    """Validate a media token for ``video_id``; raise if invalid/expired/mismatched."""
    parts = token.split(".")
    if len(parts) != 3:
        raise UnauthorizedError("Invalid media token")
    video_hex, exp_str, signature = parts
    try:
        exp = int(exp_str)
    except ValueError as exc:
        raise UnauthorizedError("Invalid media token") from exc

    expected = _sign(f"{video_hex}.{exp}", get_settings().media_token_secret)
    if not hmac.compare_digest(signature, expected):
        raise UnauthorizedError("Invalid media token")
    if exp < int(time.time()):
        raise UnauthorizedError("Media token expired")
    if video_hex != video_id.hex:
        raise UnauthorizedError("Media token does not authorize this video")
