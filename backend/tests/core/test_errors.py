import pytest
from app.core.errors import (
    AppError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    register_error_handlers,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (BadRequestError, 400, "BAD_REQUEST"),
        (UnauthorizedError, 401, "UNAUTHORIZED"),
        (ForbiddenError, 403, "FORBIDDEN"),
        (NotFoundError, 404, "NOT_FOUND"),
    ],
)
def test_subclass_defaults(exc: type[AppError], status: int, code: str) -> None:
    error = exc("boom")

    assert error.status_code == status
    assert error.code == code
    assert error.message == "boom"


def test_code_override() -> None:
    error = BadRequestError("bad move", code="INVALID_MOVE")

    assert error.code == "INVALID_MOVE"
    assert error.status_code == 400


def test_handler_renders_envelope() -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise NotFoundError("nope")

    resp = TestClient(app).get("/boom")

    assert resp.status_code == 404
    assert resp.json() == {"error": {"code": "NOT_FOUND", "message": "nope"}}
