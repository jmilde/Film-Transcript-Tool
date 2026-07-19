import uuid
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.db.session import get_db
from app.models.user import User

# Supabase issues asymmetric JWTs (ES256 for new projects, RS256 for older
# ones) verified via the project's JWKS endpoint.
ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"


class Claims(BaseModel):
    """The subset of Supabase JWT claims the backend consumes."""

    sub: uuid.UUID
    email: str | None = None
    display_name: str | None = None


@lru_cache
def _jwk_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url)


def _signing_key(token: str, settings: Settings) -> Any:
    return _jwk_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token).key


def verify_jwt(token: str) -> Claims:
    settings = get_settings()
    try:
        key = _signing_key(token, settings)
        payload: dict[str, Any] = jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid authentication token") from exc

    metadata = payload.get("user_metadata") or {}
    display_name = metadata.get("full_name") or metadata.get("name")
    return Claims(sub=payload["sub"], email=payload.get("email"), display_name=display_name)


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing authentication token")

    claims = verify_jwt(credentials.credentials)
    user = db.get(User, claims.sub)
    if user is None:
        user = User(
            id=claims.sub,
            email=claims.email or f"{claims.sub}@users.noreply",
            display_name=claims.display_name,
        )
        db.add(user)
        db.flush()
    return user
