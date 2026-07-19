import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models import Folder, Project, ProjectMembership, User


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
