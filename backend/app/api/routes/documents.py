from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import (
    require_document_access,
    require_min_role,
    require_project_editor,
    require_project_member,
)
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.document import Document
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User
from app.schemas.document import (
    ClipBlockRead,
    ClipBlockResolveRequest,
    DocumentCreate,
    DocumentRead,
    DocumentSummary,
    DocumentUpdate,
)
from app.services.documents import (
    create_document,
    delete_document,
    list_documents,
    resolve_clip_block,
    resolve_document_content,
    update_document,
)

router = APIRouter(tags=["documents"])


def _document_read(session: Session, document: Document) -> DocumentRead:
    """Mirrors ``chat.py::_enrich_citations`` — resolve clip blocks fresh on every read."""
    return DocumentRead(
        id=document.id,
        project_id=document.project_id,
        title=document.title,
        content=resolve_document_content(session, document),
        version=document.version,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.post("/projects/{project_id}/documents", response_model=DocumentRead, status_code=201)
def create(
    payload: DocumentCreate,
    project: Project = Depends(require_project_editor),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentRead:
    document = create_document(db, project.id, user.id, payload.title)
    db.commit()
    db.refresh(document)
    return _document_read(db, document)


@router.get("/projects/{project_id}/documents", response_model=list[DocumentSummary])
def list_project_documents(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[Document]:
    return list_documents(db, project.id)


@router.get("/documents/{document_id}", response_model=DocumentRead)
def get(
    document: Document = Depends(require_document_access),
    db: Session = Depends(get_db),
) -> DocumentRead:
    return _document_read(db, document)


@router.patch("/documents/{document_id}", response_model=DocumentRead)
def update(
    payload: DocumentUpdate,
    document: Document = Depends(require_min_role(require_document_access, MembershipRole.EDITOR)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentRead:
    updated = update_document(
        db,
        document,
        user_id=user.id,
        title=payload.title,
        content=payload.content,
        expected_version=payload.expected_version,
    )
    db.commit()
    db.refresh(updated)
    return _document_read(db, updated)


@router.delete("/documents/{document_id}", status_code=204)
def delete(
    document: Document = Depends(require_min_role(require_document_access, MembershipRole.EDITOR)),
    db: Session = Depends(get_db),
) -> Response:
    delete_document(db, document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/clip-blocks/resolve", response_model=ClipBlockRead)
def resolve_clip_block_route(
    payload: ClipBlockResolveRequest,
    document: Document = Depends(require_document_access),
    db: Session = Depends(get_db),
) -> ClipBlockRead:
    """Lets the editor populate a newly inserted node's attrs immediately, without a
    full document round-trip. ``document`` only gates access — the clip itself can
    reference any transcript, since a clip's source video need not be the one
    the document is scoped to (documents are project-scoped, not video-scoped).
    """
    return resolve_clip_block(
        db,
        project_id=document.project_id,
        transcript_id=payload.transcript_id,
        start_token_id=payload.start_token_id,
        end_token_id=payload.end_token_id,
    )
