from pathlib import Path

from fastapi import APIRouter, Depends, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_storage, require_folder_access, require_video_access
from app.core.auth import get_current_user
from app.core.errors import BadRequestError
from app.db.session import get_db
from app.models.asset import AssetType, VideoAsset
from app.models.folder import Folder
from app.models.job import JobStatus, ProcessingJob
from app.models.user import User
from app.models.video import Video
from app.schemas.video import (
    VideoAssetRead,
    VideoJobRead,
    VideoRead,
    VideoUploadResponse,
)
from app.services.pipeline import FIRST_STAGE
from app.storage.base import Storage

router = APIRouter(tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov"}


@router.post(
    "/folders/{folder_id}/videos",
    response_model=VideoUploadResponse,
    status_code=201,
)
def upload_video(
    file: UploadFile,
    folder: Folder = Depends(require_folder_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> VideoUploadResponse:
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise BadRequestError("Unsupported format; only MP4 and MOV are allowed")

    video = Video(
        folder_id=folder.id,
        name=Path(filename).stem or "Untitled",
        original_filename=filename,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()

    key = f"videos/{video.id}/original{ext}"
    storage.save(key, file.file)
    db.add(
        VideoAsset(
            video_id=video.id,
            type=AssetType.ORIGINAL,
            storage_path=key,
            mime_type=file.content_type,
            size=file.size,
        )
    )

    job = ProcessingJob(video_id=video.id, type=FIRST_STAGE, status=JobStatus.PENDING)
    db.add(job)
    db.flush()
    db.commit()
    return VideoUploadResponse(video_id=video.id, processing_job_id=job.id)


@router.get("/videos/{video_id}", response_model=VideoRead)
def get_video(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
) -> VideoRead:
    assets = db.execute(select(VideoAsset).where(VideoAsset.video_id == video.id)).scalars().all()
    jobs = (
        db.execute(
            select(ProcessingJob)
            .where(ProcessingJob.video_id == video.id)
            .order_by(ProcessingJob.created_at)
        )
        .scalars()
        .all()
    )
    return VideoRead(
        id=video.id,
        folder_id=video.folder_id,
        name=video.name,
        original_filename=video.original_filename,
        duration=video.duration,
        frame_rate=video.frame_rate,
        width=video.width,
        height=video.height,
        assets=[VideoAssetRead.model_validate(a) for a in assets],
        jobs=[VideoJobRead.model_validate(j) for j in jobs],
    )


@router.delete("/videos/{video_id}", status_code=204)
def delete_video(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> Response:
    # Collect stored file keys before the DB cascade removes the asset rows.
    keys = list(
        db.execute(select(VideoAsset.storage_path).where(VideoAsset.video_id == video.id)).scalars()
    )
    db.delete(video)
    db.commit()
    for key in keys:
        storage.delete(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
