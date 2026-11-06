import pytest
from app.core.errors import (
    AppError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    UnhandledErrorMiddleware,
    register_error_handlers,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


def test_unhandled_error_is_a_json_500_with_cors_headers() -> None:
    # Without UnhandledErrorMiddleware inside CORSMiddleware, the 500 comes
    # from Starlette's outermost ServerErrorMiddleware with no CORS headers,
    # and the browser reports it as a CORS failure instead of a server error.
    app = FastAPI()
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("database is down")

    resp = TestClient(app).get("/boom", headers={"Origin": "http://localhost:5173"})

    assert resp.status_code == 500
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert resp.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
