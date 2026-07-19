import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import WorkerSessionLocal
from app.models.job import JobStatus, JobType, ProcessingJob
from app.worker.claim import claim_next_job
from app.worker.handlers.noop import handle_noop

JobHandler = Callable[[Session, ProcessingJob], dict[str, Any] | None]

HANDLERS: dict[JobType, JobHandler] = {
    JobType.NOOP: handle_noop,
}


def run_once(
    session: Session, handlers: dict[JobType, JobHandler] | None = None
) -> ProcessingJob | None:
    """Claim and process a single job, if one is available.

    Returns the processed job (in its terminal state), or ``None`` if the queue
    had no claimable work. The claim is committed immediately so the row lock is
    released while the (potentially long-running) handler executes.
    """
    registry = HANDLERS if handlers is None else handlers

    job = claim_next_job(session)
    if job is None:
        return None
    job_id = job.id
    session.commit()

    try:
        handler = registry[job.type]
        result = handler(session, job)
    except Exception as exc:
        session.rollback()
        failed = session.get(ProcessingJob, job_id)
        if failed is not None:
            failed.status = JobStatus.FAILED
            failed.error_message = str(exc)
            failed.completed_at = datetime.now(UTC)
            session.commit()
        return failed

    job.status = JobStatus.COMPLETED
    job.progress = 100
    job.result = result
    job.completed_at = datetime.now(UTC)
    session.commit()
    return job


def run_forever(poll_interval: float = 2.0) -> None:
    """Poll the queue forever, sleeping when idle."""
    while True:
        with WorkerSessionLocal() as session:
            job = run_once(session)
        if job is None:
            time.sleep(poll_interval)


if __name__ == "__main__":
    run_forever()
