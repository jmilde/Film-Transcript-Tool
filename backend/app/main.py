from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    chat,
    comments,
    documents,
    exports,
    folders,
    jobs,
    members,
    projects,
    search,
    speakers,
    tokens,
    transcripts,
    videos,
)
from app.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Film Transcript Tool API")

    # The browser frontend is served from a different origin (the Vite dev server
    # in development), so it needs CORS to call the API and read responses.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(projects.router)
    app.include_router(folders.router)
    app.include_router(videos.router)
    app.include_router(jobs.router)
    app.include_router(transcripts.router)
    app.include_router(speakers.router)
    app.include_router(tokens.router)
    app.include_router(comments.router)
    app.include_router(search.router)
    app.include_router(exports.router)
    app.include_router(members.router)
    app.include_router(chat.router)
    app.include_router(documents.router)

    return app


app = create_app()
