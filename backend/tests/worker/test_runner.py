from typing import Any

import pytest
from app.models.job import JobStatus, JobType, ProcessingJob
from app.worker.runner import run_once
from sqlalchemy import update
from sqlalchemy.orm import Session


@pytest.fixture
def isolated_queue(db_session: Session) -> Session:
    """Park any pre-existing pending jobs (within the rolled-back transaction) so
    ``claim_next_job`` deterministically claims the job the test creates."""
    db_session.execute(
        update(ProcessingJob)
        .where(ProcessingJob.status == JobStatus.PENDING)
        .values(status=JobStatus.RUNNING)
    )
    db_session.flush()
    return db_session


def test_noop_job_completes(isolated_queue: Session) -> None:
    job = ProcessingJob(type=JobType.NOOP, status=JobStatus.PENDING)
    isolated_queue.add(job)
    isolated_queue.flush()

    result = run_once(isolated_queue)

    assert result is not None
    assert result.id == job.id
    assert result.status is JobStatus.COMPLETED
    assert result.progress == 100
    assert result.result == {"noop": True}
    assert result.completed_at is not None


def test_failing_handler_marks_failed(isolated_queue: Session) -> None:
    def boom(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
        raise RuntimeError("kaboom")

    job = ProcessingJob(type=JobType.NOOP, status=JobStatus.PENDING)
    isolated_queue.add(job)
    isolated_queue.flush()

    result = run_once(isolated_queue, handlers={JobType.NOOP: boom})

    assert result is not None
    assert result.status is JobStatus.FAILED
    assert "kaboom" in (result.error_message or "")
    assert result.completed_at is not None


def test_run_once_empty_queue_returns_none(isolated_queue: Session) -> None:
    assert run_once(isolated_queue) is None
