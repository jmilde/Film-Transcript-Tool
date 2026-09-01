import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.api.deps import require_project_editor, require_project_member
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.document import Document
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(tags=["projects"])


class _ProjectCounts:
    def __init__(self, video_count: int, member_count: int, document_count: int) -> None:
        self.video_count = video_count
        self.member_count = member_count
        self.document_count = document_count


def _counts_by_project(
    db: Session,
    project_id_column: InstrumentedAttribute[uuid.UUID],
    project_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Grouped count of a table's rows per project — three of these (videos,
    memberships, documents) rather than one fanned-out join, so counting one
    kind of row can never multiply another (e.g. 3 videos * 2 members)."""
    if not project_ids:
        return {}
    stmt = (
        select(project_id_column, func.count())
        .where(project_id_column.in_(project_ids))
        .group_by(project_id_column)
    )
    return dict(db.execute(stmt).tuples().all())


def _counts_for_projects(
    db: Session, project_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, _ProjectCounts]:
    videos = _counts_by_project(db, Video.project_id, project_ids)
    members = _counts_by_project(db, ProjectMembership.project_id, project_ids)
    documents = _counts_by_project(db, Document.project_id, project_ids)
    return {
        pid: _ProjectCounts(
            video_count=videos.get(pid, 0),
            member_count=members.get(pid, 0),
            document_count=documents.get(pid, 0),
        )
        for pid in project_ids
    }


def _project_read(project: Project, role: MembershipRole, counts: _ProjectCounts) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        name=project.name,
        description=project.description,
        archived_at=project.archived_at,
        created_at=project.created_at,
        updated_at=project.updated_at,
        my_role=role,
        video_count=counts.video_count,
        member_count=counts.member_count,
        document_count=counts.document_count,
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
    counts = _counts_for_projects(db, [project.id])[project.id]
    return _project_read(project, MembershipRole.OWNER, counts)


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
    rows = db.execute(stmt).all()
    counts = _counts_for_projects(db, [project.id for project, _ in rows])
    return [_project_read(project, role, counts[project.id]) for project, role in rows]


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    counts = _counts_for_projects(db, [project.id])[project.id]
    return _project_read(project, _my_role(db, project.id, user.id), counts)


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
    counts = _counts_for_projects(db, [project.id])[project.id]
    return _project_read(project, _my_role(db, project.id, user.id), counts)
