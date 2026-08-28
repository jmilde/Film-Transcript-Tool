from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.job import JobStatus, ProcessingJob


def claim_next_job(session: Session) -> ProcessingJob | None:
    """Atomically claim the oldest claimable pending job for this worker.

    Uses ``FOR UPDATE SKIP LOCKED`` so concurrent workers never claim the same
    row: the first worker locks it, others skip past it to the next candidate.
    A job whose ``run_after`` is still in the future is not yet claimable —
    this is what lets debounced jobs (see ``app/services/reembed.py``) sit
    pending without being picked up before their delay elapses. The claimed
    row is transitioned to ``running`` and flushed but not committed — the
    caller commits to release the lock.
    """
    now = datetime.now(UTC)
    job = session.execute(
        select(ProcessingJob)
        .where(
            ProcessingJob.status == JobStatus.PENDING,
            or_(ProcessingJob.run_after.is_(None), ProcessingJob.run_after <= now),
        )
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
