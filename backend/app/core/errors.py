import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for errors that map to a JSON error response.

    Handlers render these as ``{"error": {"code", "message"}}`` with the
    subclass's ``status_code``.
    """

    status_code: int = 400
    code: str = "ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.details = details


class BadRequestError(AppError):
    status_code = 400
    code = "BAD_REQUEST"


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


def register_error_handlers(app: FastAPI) -> None:
    async def handle_app_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppError)
        body: dict[str, object] = {"code": exc.code, "message": exc.message}
        if exc.details is not None:
            body.update(exc.details)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": body},
        )

    app.add_exception_handler(AppError, handle_app_error)


class UnhandledErrorMiddleware:
    """Renders an unhandled exception as a JSON 500 in the usual error envelope.

    Starlette routes uncaught exceptions to its outermost ``ServerErrorMiddleware``,
    which sits *outside* ``CORSMiddleware`` — so the browser receives a 500 with
    no ``Access-Control-Allow-Origin`` header and reports it as a CORS failure,
    hiding the real error (e.g. the database being down). Added *before*
    ``CORSMiddleware`` (so CORS wraps it), this produces the 500 inside the CORS
    layer instead. A response that has already started streaming can't be
    replaced, so that case is re-raised as before.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_tracking_start(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_tracking_start)
        except Exception:
            if response_started:
                raise
            logger.exception("Unhandled error on %s %s", scope["method"], scope["path"])
            response = JSONResponse(
                status_code=500,
                content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
            )
            await response(scope, receive, send)
