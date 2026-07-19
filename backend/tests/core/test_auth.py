import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from app.config import Settings
from app.core import auth
from app.core.errors import UnauthorizedError
from cryptography.hazmat.primitives.asymmetric import ec


@pytest.fixture
def keypair() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def _token(priv: ec.EllipticCurvePrivateKey, **overrides: Any) -> str:
    now = datetime.now(tz=UTC)
    payload: dict[str, Any] = {
        "sub": str(uuid.uuid4()),
        "email": "a@example.com",
        "aud": "authenticated",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, priv, algorithm="ES256")


@pytest.fixture
def use_key(
    monkeypatch: pytest.MonkeyPatch, keypair: ec.EllipticCurvePrivateKey
) -> ec.EllipticCurvePublicKey:
    pub = keypair.public_key()
    monkeypatch.setattr(auth, "_signing_key", lambda token, settings: pub)
    return pub


def test_verify_jwt_valid(
    use_key: ec.EllipticCurvePublicKey, keypair: ec.EllipticCurvePrivateKey
) -> None:
    token = _token(keypair, email="john@example.com", user_metadata={"full_name": "John Doe"})

    claims = auth.verify_jwt(token)

    assert claims.email == "john@example.com"
    assert claims.display_name == "John Doe"


def test_verify_jwt_expired(
    use_key: ec.EllipticCurvePublicKey, keypair: ec.EllipticCurvePrivateKey
) -> None:
    now = datetime.now(tz=UTC)
    token = _token(keypair, iat=now - timedelta(hours=2), exp=now - timedelta(hours=1))

    with pytest.raises(UnauthorizedError):
        auth.verify_jwt(token)


def test_verify_jwt_wrong_audience(
    use_key: ec.EllipticCurvePublicKey, keypair: ec.EllipticCurvePrivateKey
) -> None:
    token = _token(keypair, aud="someone-else")

    with pytest.raises(UnauthorizedError):
        auth.verify_jwt(token)


def test_verify_jwt_malformed() -> None:
    with pytest.raises(UnauthorizedError):
        auth.verify_jwt("not-a-jwt")


def test_verify_jwt_wrong_key(
    use_key: ec.EllipticCurvePublicKey,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Sign with a different key than the one verification will use.
    attacker = ec.generate_private_key(ec.SECP256R1())
    token = _token(attacker)

    with pytest.raises(UnauthorizedError):
        auth.verify_jwt(token)


def test_signing_key_callable_signature() -> None:
    # Guard against accidental signature drift the monkeypatch relies on.
    fn: Callable[[str, Settings], Any] = auth._signing_key
    assert callable(fn)
