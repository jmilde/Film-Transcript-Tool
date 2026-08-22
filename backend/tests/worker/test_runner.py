from typing import Any

import pytest
from app.models.folder import Folder
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.worker.runner import run_once
from sqlalchemy import select, update
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


def test_unregistered_handler_fails_with_clear_message(isolated_queue: Session) -> None:
    job = ProcessingJob(type=JobType.NOOP, status=JobStatus.PENDING)
    isolated_queue.add(job)
    isolated_queue.flush()

    result = run_once(isolated_queue, handlers={})

    assert result is not None
    assert result.status is JobStatus.FAILED
    assert "No handler registered" in (result.error_message or "")


def _make_video(db: Session, user: User) -> Video:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    return video


def test_completing_stage_enqueues_next_stage(isolated_queue: Session, user: User) -> None:
    video = _make_video(isolated_queue, user)
    job = ProcessingJob(
        video_id=video.id,
        project_id=video.project_id,
        type=JobType.EXTRACT_METADATA,
        status=JobStatus.PENDING,
    )
    isolated_queue.add(job)
    isolated_queue.flush()

    # Stub the metadata handler so no real ffmpeg runs; we only exercise chaining.
    def ok(session: Session, j: ProcessingJob) -> dict[str, Any] | None:
        return {"ok": True}

    result = run_once(isolated_queue, handlers={JobType.EXTRACT_METADATA: ok})

    assert result is not None and result.status is JobStatus.COMPLETED
    following = isolated_queue.execute(
        select(ProcessingJob).where(
            ProcessingJob.video_id == video.id,
            ProcessingJob.type == JobType.GENERATE_PROXY,
        )
    ).scalar_one()
    assert following.status is JobStatus.PENDING


def test_completing_final_stage_enqueues_nothing(isolated_queue: Session, user: User) -> None:
    video = _make_video(isolated_queue, user)
    job = ProcessingJob(
        video_id=video.id,
        project_id=video.project_id,
        type=JobType.TRANSCRIBE,
        status=JobStatus.PENDING,
    )
    isolated_queue.add(job)
    isolated_queue.flush()

    def ok(session: Session, j: ProcessingJob) -> dict[str, Any] | None:
        return {"ok": True}

    run_once(isolated_queue, handlers={JobType.TRANSCRIBE: ok})

    # TRANSCRIBE is the last upload stage; nothing new is enqueued for the video.
    remaining = (
        isolated_queue.execute(
            select(ProcessingJob).where(
                ProcessingJob.video_id == video.id,
                ProcessingJob.status == JobStatus.PENDING,
            )
        )
        .scalars()
        .all()
    )
    assert remaining == []
