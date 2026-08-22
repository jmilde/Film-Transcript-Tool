from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    get_storage,
    require_export_access,
    require_min_role,
    require_transcript_access,
)
from app.core.auth import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.export import Export, ExportType
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import MembershipRole
from app.models.transcript import Transcript
from app.models.user import User
from app.schemas.export import ExportCreate, ExportCreateResponse, ExportRead
from app.storage.base import Storage

router = APIRouter(tags=["exports"])

_MEDIA_TYPES = {
    ExportType.MARKDOWN: "text/markdown",
    ExportType.SRT: "application/x-subrip",
}


@router.post("/transcripts/{transcript_id}/exports", response_model=ExportCreateResponse)
def create_export(
    payload: ExportCreate,
    transcript: Transcript = Depends(
        require_min_role(require_transcript_access, MembershipRole.EDITOR)
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExportCreateResponse:
    """Request an export: record the row and enqueue the worker that renders it."""
    export = Export(
        transcript_id=transcript.id,
        project_id=transcript.project_id,
        type=payload.format,
        created_by=user.id,
    )
    db.add(export)
    db.flush()
    # The job carries the target export id as its input; the worker overwrites
    # ``result`` with the final {export_id, storage_path} once it renders.
    job = ProcessingJob(
        video_id=transcript.video_id,
        project_id=transcript.project_id,
        type=JobType.EXPORT,
        status=JobStatus.PENDING,
        result={"export_id": str(export.id)},
    )
    db.add(job)
    db.flush()
    db.commit()
    return ExportCreateResponse(export_id=export.id, processing_job_id=job.id)


@router.get("/exports/{export_id}", response_model=ExportRead)
def get_export(export: Export = Depends(require_export_access)) -> ExportRead:
    return ExportRead(
        id=export.id,
        transcript_id=export.transcript_id,
        type=export.type,
        ready=export.storage_path is not None,
        created_at=export.created_at,
    )


@router.get("/exports/{export_id}/content")
def download_export(
    export: Export = Depends(require_export_access),
    storage: Storage = Depends(get_storage),
) -> Response:
    # 404 until the worker has rendered the file (storage_path stays null).
    if export.storage_path is None:
        raise NotFoundError("Export is not ready yet")
    with storage.open(export.storage_path) as handle:
        content = handle.read()
    return Response(content=content, media_type=_MEDIA_TYPES[export.type])
