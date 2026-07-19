import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.auth import get_current_user
from app.core.errors import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.folder import Folder
from app.models.job import ProcessingJob
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.storage.base import Storage
from app.storage.local import LocalStorage


def get_storage() -> Storage:
    return LocalStorage(get_settings().storage_root)


def _require_membership(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    membership = db.execute(
        select(ProjectMembership.id).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise ForbiddenError("You are not a member of this project")


def require_project_member(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")
    _require_membership(db, project.id, user.id)
    return project


def require_folder_access(
    folder_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise NotFoundError("Folder not found")
    _require_membership(db, folder.project_id, user.id)
    return folder


def require_video_access(
    video_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Video:
    video = db.get(Video, video_id)
    if video is None:
        raise NotFoundError("Video not found")
    _require_membership(db, video.project_id, user.id)
    return video


def require_job_access(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None or job.project_id is None:
        raise NotFoundError("Job not found")
    _require_membership(db, job.project_id, user.id)
    return job
