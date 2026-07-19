import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_folder_access, require_project_member
from app.core.auth import get_current_user
from app.core.errors import BadRequestError
from app.db.session import get_db
from app.models.folder import Folder
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.schemas.folder import (
    FolderContents,
    FolderCreate,
    FolderRead,
    FolderUpdate,
    VideoSummary,
)

router = APIRouter(tags=["folders"])


@router.post("/projects/{project_id}/folders", response_model=FolderRead, status_code=201)
def create_folder(
    payload: FolderCreate,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    if payload.parent_folder_id is not None:
        parent = db.get(Folder, payload.parent_folder_id)
        if parent is None or parent.project_id != project.id:
            raise BadRequestError("parent_folder_id does not belong to this project")
    folder = Folder(
        project_id=project.id,
        parent_folder_id=payload.parent_folder_id,
        name=payload.name,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get("/projects/{project_id}/folders", response_model=list[FolderRead])
def list_root_folders(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[Folder]:
    """Top-level folders of a project (the folder tree's entry point).

    Videos always live inside a folder, so a project's root contains only
    folders; deeper levels are fetched per-folder via ``GET /folders/{id}``.
    """
    return list(
        db.execute(
            select(Folder)
            .where(Folder.project_id == project.id, Folder.parent_folder_id.is_(None))
            .order_by(Folder.name)
        )
        .scalars()
        .all()
    )


@router.get("/folders/{folder_id}", response_model=FolderContents)
def get_folder(
    folder: Folder = Depends(require_folder_access),
    db: Session = Depends(get_db),
) -> FolderContents:
    child_folders = (
        db.execute(select(Folder).where(Folder.parent_folder_id == folder.id).order_by(Folder.name))
        .scalars()
        .all()
    )
    videos = (
        db.execute(select(Video).where(Video.folder_id == folder.id).order_by(Video.name))
        .scalars()
        .all()
    )
    return FolderContents(
        folder=FolderRead.model_validate(folder),
        folders=[FolderRead.model_validate(f) for f in child_folders],
        videos=[VideoSummary.model_validate(v) for v in videos],
    )


def _apply_move(db: Session, folder: Folder, new_parent_id: uuid.UUID | None) -> None:
    if new_parent_id == folder.id:
        raise BadRequestError("A folder cannot be its own parent")
    if new_parent_id is not None:
        parent = db.get(Folder, new_parent_id)
        if parent is None or parent.project_id != folder.project_id:
            raise BadRequestError("parent_folder_id does not belong to this project")
        # Reject moving a folder into one of its own descendants (would form a cycle).
        ancestor: Folder | None = parent
        while ancestor is not None:
            if ancestor.id == folder.id:
                raise BadRequestError("Cannot move a folder into its own descendant")
            ancestor = (
                db.get(Folder, ancestor.parent_folder_id)
                if ancestor.parent_folder_id is not None
                else None
            )
    folder.parent_folder_id = new_parent_id


@router.patch("/folders/{folder_id}", response_model=FolderRead)
def update_folder(
    payload: FolderUpdate,
    folder: Folder = Depends(require_folder_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        folder.name = payload.name
    if "parent_folder_id" in fields:
        _apply_move(db, folder, payload.parent_folder_id)
    folder.updated_by = user.id
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(
    folder: Folder = Depends(require_folder_access),
    db: Session = Depends(get_db),
) -> Response:
    db.delete(folder)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
