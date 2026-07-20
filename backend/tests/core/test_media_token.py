import time
import uuid

import pytest
from app.core.errors import UnauthorizedError
from app.core.media_token import mint_media_token, verify_media_token


def test_roundtrip_valid_token() -> None:
    video_id = uuid.uuid4()
    token = mint_media_token(video_id)
    # Does not raise for the matching video within its lifetime.
    verify_media_token(token, video_id)


def test_rejects_token_for_a_different_video() -> None:
    token = mint_media_token(uuid.uuid4())
    with pytest.raises(UnauthorizedError):
        verify_media_token(token, uuid.uuid4())


def test_rejects_tampered_signature() -> None:
    video_id = uuid.uuid4()
    token = mint_media_token(video_id)
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(UnauthorizedError):
        verify_media_token(tampered, video_id)


def test_rejects_expired_token() -> None:
    video_id = uuid.uuid4()
    token = mint_media_token(video_id, ttl_seconds=-1)
    with pytest.raises(UnauthorizedError):
        verify_media_token(token, video_id)


def test_rejects_malformed_token() -> None:
    with pytest.raises(UnauthorizedError):
        verify_media_token("not-a-valid-token", uuid.uuid4())


def test_token_carries_future_expiry() -> None:
    token = mint_media_token(uuid.uuid4(), ttl_seconds=120)
    exp = int(token.split(".")[1])
    assert exp > int(time.time())
