import uuid
from collections.abc import Callable

from app.models.folder import Folder
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _seed_job(
    db_session: Session,
    user: User,
    *,
    status: JobStatus = JobStatus.PENDING,
    error_message: str | None = None,
) -> ProcessingJob:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(ProjectMembership(project_id=project.id, user_id=user.id))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video = Video(
        folder_id=folder.id,
        name="V",
        original_filename="v.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()
    job = ProcessingJob(
        video_id=video.id,
        type=JobType.EXTRACT_METADATA,
        status=status,
        error_message=error_message,
    )
    db_session.add(job)
    db_session.flush()
    return job


def test_get_job(auth_client: TestClient, db_session: Session, user: User) -> None:
    job = _seed_job(db_session, user)

    resp = auth_client.get(f"/jobs/{job.id}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(job.id)
    assert body["type"] == "extract_metadata"
    assert body["status"] == "pending"


def test_get_missing_job_404(auth_client: TestClient) -> None:
    resp = auth_client.get(f"/jobs/{uuid.uuid4()}")

    assert resp.status_code == 404


def test_retry_failed_job(auth_client: TestClient, db_session: Session, user: User) -> None:
    job = _seed_job(db_session, user, status=JobStatus.FAILED, error_message="boom")

    resp = auth_client.post(f"/jobs/{job.id}/retry")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending"
    assert body["error_message"] is None
    assert body["completed_at"] is None


def test_retry_non_failed_job_rejected(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    job = _seed_job(db_session, user, status=JobStatus.PENDING)

    resp = auth_client.post(f"/jobs/{job.id}/retry")

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BAD_REQUEST"


def test_get_job_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    job = _seed_job(db_session, user)

    resp = app_client(other_user).get(f"/jobs/{job.id}")

    assert resp.status_code == 403
