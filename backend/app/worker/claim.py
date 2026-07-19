from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import JobStatus, ProcessingJob


def claim_next_job(session: Session) -> ProcessingJob | None:
    """Atomically claim the oldest pending job for this worker.

    Uses ``FOR UPDATE SKIP LOCKED`` so concurrent workers never claim the same
    row: the first worker locks it, others skip past it to the next candidate.
    The claimed row is transitioned to ``running`` and flushed but not
    committed — the caller commits to release the lock.
    """
    job = session.execute(
        select(ProcessingJob)
        .where(ProcessingJob.status == JobStatus.PENDING)
        .order_by(ProcessingJob.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    ).scalar_one_or_none()
    if job is None:
        return None

    job.status = JobStatus.RUNNING
    job.started_at = datetime.now(UTC)
    session.flush()
    return job
