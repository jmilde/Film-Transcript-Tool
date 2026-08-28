import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from app.config import get_settings
from app.models.job import JobStatus, JobType, ProcessingJob
from app.worker.claim import claim_next_job
from sqlalchemy import Engine, create_engine, delete, update
from sqlalchemy.orm import Session


@pytest.fixture
def engine() -> Iterator[Engine]:
    # The worker/session connection (port 5432) supports FOR UPDATE SKIP LOCKED.
    eng = create_engine(get_settings().database_url_worker, pool_pre_ping=True)
    yield eng
    eng.dispose()


@pytest.fixture
def committed_job(engine: Engine) -> Iterator[uuid.UUID]:
    """A real, committed pending job — cleaned up explicitly (no rollback here).

    The claim-race test needs two independent connections to see the same row,
    which the transaction-rollback ``db_session`` fixture cannot provide.
    """
    job_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(ProcessingJob(id=job_id, type=JobType.NOOP, status=JobStatus.PENDING))
        session.commit()
    try:
        yield job_id
    finally:
        with Session(engine) as session:
            session.execute(delete(ProcessingJob).where(ProcessingJob.id == job_id))
            session.commit()


def test_skip_locked_prevents_double_claim(engine: Engine, committed_job: uuid.UUID) -> None:
    session_a = Session(engine)
    session_b = Session(engine)
    try:
        # A locks a pending row (uncommitted); B must skip past any row A holds.
        job_a = claim_next_job(session_a)
        job_b = claim_next_job(session_b)

        claimed = {job.id for job in (job_a, job_b) if job is not None}
        # Our job was claimed by exactly one of them...
        assert committed_job in claimed
        # ...and the two workers never claimed the same row.
        assert not (job_a is not None and job_b is not None and job_a.id == job_b.id)
    finally:
        session_a.rollback()
        session_b.rollback()
        session_a.close()
        session_b.close()


@pytest.fixture
def isolated_queue(db_session: Session) -> Session:
    """Park any pre-existing pending jobs so claiming is deterministic."""
    db_session.execute(
        update(ProcessingJob)
        .where(ProcessingJob.status == JobStatus.PENDING)
        .values(status=JobStatus.RUNNING)
    )
    db_session.flush()
    return db_session


def test_future_run_after_is_not_claimable(isolated_queue: Session) -> None:
    future = ProcessingJob(
        type=JobType.NOOP,
        status=JobStatus.PENDING,
        run_after=datetime.now(UTC) + timedelta(minutes=5),
    )
    isolated_queue.add(future)
    isolated_queue.flush()

    assert claim_next_job(isolated_queue) is None


def test_elapsed_run_after_is_claimable(isolated_queue: Session) -> None:
    ready = ProcessingJob(
        type=JobType.NOOP,
        status=JobStatus.PENDING,
        run_after=datetime.now(UTC) - timedelta(seconds=1),
    )
    isolated_queue.add(ready)
    isolated_queue.flush()

    claimed = claim_next_job(isolated_queue)

    assert claimed is not None
    assert claimed.id == ready.id
