import uuid
from datetime import UTC, datetime, timedelta

from app.models.folder import Folder
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptType
from app.models.user import User
from app.models.video import Video
from app.services.reembed import REEMBED_DEBOUNCE_SECONDS, schedule_reembed
from sqlalchemy import select
from sqlalchemy.orm import Session


def _transcript(db: Session, user: User) -> Transcript:
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
    transcript = Transcript(
        video_id=video.id,
        project_id=project.id,
        language="en",
        type=TranscriptType.ORIGINAL,
        created_by=user.id,
    )
    db.add(transcript)
    db.flush()
    return transcript


def _pending_embed_jobs(db: Session) -> list[ProcessingJob]:
    return list(
        db.execute(
            select(ProcessingJob).where(
                ProcessingJob.type == JobType.GENERATE_EMBEDDINGS,
                ProcessingJob.status == JobStatus.PENDING,
            )
        ).scalars()
    )


def test_schedule_reembed_creates_a_debounced_pending_job(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)

    schedule_reembed(db_session, transcript.id)

    jobs = _pending_embed_jobs(db_session)
    assert len(jobs) == 1
    job = jobs[0]
    assert job.video_id == transcript.video_id
    assert job.project_id == transcript.project_id
    assert job.result == {"transcript_id": str(transcript.id), "force": True}
    assert job.run_after is not None
    now = datetime.now(UTC)
    assert now < job.run_after <= now + timedelta(seconds=REEMBED_DEBOUNCE_SECONDS + 5)


def test_schedule_reembed_debounces_repeated_calls_into_one_job(
    db_session: Session, user: User
) -> None:
    transcript = _transcript(db_session, user)

    schedule_reembed(db_session, transcript.id)
    first_run_after = _pending_embed_jobs(db_session)[0].run_after
    assert first_run_after is not None

    # Simulate a second edit landing right away: the existing job's run_after
    # should be pushed out rather than a second job being queued.
    schedule_reembed(db_session, transcript.id)

    jobs = _pending_embed_jobs(db_session)
    assert len(jobs) == 1
    assert jobs[0].run_after is not None
    assert jobs[0].run_after >= first_run_after


def test_schedule_reembed_ignores_unknown_transcript(db_session: Session) -> None:
    schedule_reembed(db_session, uuid.uuid4())

    assert _pending_embed_jobs(db_session) == []
