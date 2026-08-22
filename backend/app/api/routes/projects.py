import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_editor, require_project_member
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(tags=["projects"])


def _project_read(project: Project, role: MembershipRole) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        name=project.name,
        description=project.description,
        archived_at=project.archived_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
        my_role=role,
    )


def _my_role(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> MembershipRole:
    return db.execute(
        select(ProjectMembership.role).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one()


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    db.commit()
    db.refresh(project)
    return _project_read(project, MembershipRole.OWNER)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProjectRead]:
    stmt = (
        select(Project, ProjectMembership.role)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(ProjectMembership.user_id == user.id)
        .order_by(Project.created_at)
    )
    return [_project_read(project, role) for project, role in db.execute(stmt).all()]


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    return _project_read(project, _my_role(db, project.id, user.id))


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(require_project_editor),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        project.name = payload.name
    if "description" in fields:
        project.description = payload.description
    if "archived" in fields and payload.archived is not None:
        project.archived_at = datetime.now(UTC) if payload.archived else None
    project.updated_by = user.id
    db.commit()
    db.refresh(project)
    return _project_read(project, _my_role(db, project.id, user.id))
