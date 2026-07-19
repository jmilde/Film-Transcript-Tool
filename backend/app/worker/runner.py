import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import WorkerSessionLocal
from app.models.job import JobStatus, JobType, ProcessingJob
from app.services.pipeline import next_stage
from app.worker.claim import claim_next_job
from app.worker.handlers.audio_extract import handle_extract_audio
from app.worker.handlers.export import handle_export
from app.worker.handlers.metadata import handle_extract_metadata
from app.worker.handlers.noop import handle_noop
from app.worker.handlers.proxy import handle_generate_proxy
from app.worker.handlers.transcribe import handle_transcribe
from app.worker.handlers.waveform import handle_generate_waveform

JobHandler = Callable[[Session, ProcessingJob], dict[str, Any] | None]

HANDLERS: dict[JobType, JobHandler] = {
    JobType.NOOP: handle_noop,
    JobType.EXTRACT_METADATA: handle_extract_metadata,
    JobType.GENERATE_PROXY: handle_generate_proxy,
    JobType.GENERATE_WAVEFORM: handle_generate_waveform,
    JobType.EXTRACT_AUDIO: handle_extract_audio,
    JobType.TRANSCRIBE: handle_transcribe,
    JobType.EXPORT: handle_export,
}


def _enqueue_next_stage(session: Session, job: ProcessingJob) -> None:
    """Enqueue the job that follows ``job`` in the upload pipeline, if any.

    Chaining on completion (rather than up front) is what gives the pipeline its
    resume-only-failed-stage behaviour: a stage's successor is created only once
    that stage succeeds, so a failed stage's retry picks up exactly where it
    stopped without re-running earlier, already-completed stages.
    """
    following = next_stage(job.type)
    if following is None or job.video_id is None or job.project_id is None:
        return
    session.add(
        ProcessingJob(
            video_id=job.video_id,
            project_id=job.project_id,
            type=following,
            status=JobStatus.PENDING,
        )
    )


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
        handler = registry.get(job.type)
        if handler is None:
            raise RuntimeError(f"No handler registered for job type {job.type.value!r}")
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
    _enqueue_next_stage(session, job)
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
