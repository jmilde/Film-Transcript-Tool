import uuid
from collections.abc import Iterator

import pytest
from app.config import get_settings
from app.models.job import JobStatus, JobType, ProcessingJob
from app.worker.claim import claim_next_job
from sqlalchemy import Engine, create_engine, delete
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
