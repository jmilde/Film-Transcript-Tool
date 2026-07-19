from fastapi import FastAPI

from app.api.routes import folders, jobs, projects, speakers, transcripts, videos
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Film Transcript Tool API")
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

    return app


app = create_app()
