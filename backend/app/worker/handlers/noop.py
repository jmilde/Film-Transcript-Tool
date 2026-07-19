from typing import Any

from sqlalchemy.orm import Session

from app.models.job import ProcessingJob


def handle_noop(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Smoke-test handler: does nothing and reports success."""
    return {"noop": True}
