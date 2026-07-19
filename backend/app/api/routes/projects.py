from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_member
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(tags=["projects"])


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id))
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Project]:
    stmt = (
        select(Project)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(ProjectMembership.user_id == user.id)
        .order_by(Project.created_at)
    )
    return list(db.execute(stmt).scalars().all())


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project: Project = Depends(require_project_member)) -> Project:
    return project


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
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
    return project
