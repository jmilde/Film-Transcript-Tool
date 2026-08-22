from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


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


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


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
