import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    get_storage,
    require_folder_access,
    require_min_role,
    require_video_access,
    require_video_media_access,
)
from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.core.media_token import DEFAULT_TTL_SECONDS, mint_media_token
from app.db.session import get_db
from app.models.asset import AssetType, VideoAsset
from app.models.folder import Folder
from app.models.job import JobStatus, ProcessingJob
from app.models.membership import MembershipRole
from app.models.user import User
from app.models.video import Video
from app.schemas.video import (
    MediaTokenResponse,
    VideoAssetRead,
    VideoJobRead,
    VideoRead,
    VideoUpdate,
    VideoUploadResponse,
)
from app.services.pipeline import FIRST_STAGE
from app.storage.base import Storage

router = APIRouter(tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov"}


def _find_asset(db: Session, video_id: uuid.UUID, asset_type: AssetType) -> VideoAsset | None:
    return (
        db.execute(
            select(VideoAsset).where(VideoAsset.video_id == video_id, VideoAsset.type == asset_type)
        )
        .scalars()
        .first()
    )


def _video_read(db: Session, video: Video) -> VideoRead:
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
        project_id=video.project_id,
        name=video.name,
        original_filename=video.original_filename,
        duration=video.duration,
        frame_rate=video.frame_rate,
        width=video.width,
        height=video.height,
        assets=[VideoAssetRead.model_validate(a) for a in assets],
        jobs=[VideoJobRead.model_validate(j) for j in jobs],
    )


@router.post(
    "/folders/{folder_id}/videos",
    response_model=VideoUploadResponse,
    status_code=201,
)
def upload_video(
    file: UploadFile,
    folder: Folder = Depends(require_min_role(require_folder_access, MembershipRole.EDITOR)),
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
        project_id=folder.project_id,
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

    job = ProcessingJob(
        video_id=video.id,
        project_id=folder.project_id,
        type=FIRST_STAGE,
        status=JobStatus.PENDING,
    )
    db.add(job)
    db.flush()
    db.commit()
    return VideoUploadResponse(video_id=video.id, processing_job_id=job.id)


@router.get("/videos/{video_id}", response_model=VideoRead)
def get_video(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
) -> VideoRead:
    return _video_read(db, video)


@router.patch("/videos/{video_id}", response_model=VideoRead)
def update_video(
    payload: VideoUpdate,
    video: Video = Depends(require_min_role(require_video_access, MembershipRole.EDITOR)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VideoRead:
    if "folder_id" in payload.model_fields_set and payload.folder_id is not None:
        folder = db.get(Folder, payload.folder_id)
        if folder is None or folder.project_id != video.project_id:
            raise BadRequestError("folder_id does not belong to this project")
        video.folder_id = folder.id
    video.updated_by = user.id
    db.commit()
    db.refresh(video)
    return _video_read(db, video)


@router.get("/videos/{video_id}/media-token", response_model=MediaTokenResponse)
def create_media_token(
    video: Video = Depends(require_video_access),
) -> MediaTokenResponse:
    """Mint a short-lived signed token for streaming this video's media.

    The browser attaches it as ``?token=`` on the proxy stream, which a
    ``<video>`` element cannot authenticate with a Bearer header.
    """
    return MediaTokenResponse(
        token=mint_media_token(video.id),
        expires_in=DEFAULT_TTL_SECONDS,
    )


@router.get("/videos/{video_id}/proxy")
def stream_proxy(
    video: Video = Depends(require_video_media_access),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileResponse:
    """Stream the playback proxy (falling back to the original) with Range support.

    Authorized by a signed ``?token=`` rather than a Bearer header. Starlette's
    ``FileResponse`` honors HTTP Range requests, so ``<video>`` seeking works.
    """
    asset = _find_asset(db, video.id, AssetType.PROXY) or _find_asset(
        db, video.id, AssetType.ORIGINAL
    )
    if asset is None:
        raise NotFoundError("No playable asset for this video")
    path = storage.path_for(asset.storage_path)
    if not path.is_file():
        raise NotFoundError("Media file is missing from storage")
    return FileResponse(path, media_type=asset.mime_type or "video/mp4")


@router.get("/videos/{video_id}/thumbnail")
def get_thumbnail(
    video: Video = Depends(require_video_media_access),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileResponse:
    """Serve the generated thumbnail image, authorized by a signed ``?token=``.

    Same media-token scheme as ``stream_proxy`` — this gets rendered as an
    ``<img src>`` across many videos on the search page.
    """
    asset = _find_asset(db, video.id, AssetType.THUMBNAIL)
    if asset is None:
        raise NotFoundError("No thumbnail for this video")
    path = storage.path_for(asset.storage_path)
    if not path.is_file():
        raise NotFoundError("Thumbnail file is missing from storage")
    return FileResponse(path, media_type=asset.mime_type or "image/jpeg")


@router.get("/videos/{video_id}/waveform")
def get_waveform(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileResponse:
    """Return the precomputed waveform peaks JSON for the timeline display.

    Fetched via the typed client (XHR/fetch can send a Bearer header), so this
    keeps the normal membership check rather than the media-token scheme.
    """
    asset = _find_asset(db, video.id, AssetType.WAVEFORM)
    if asset is None:
        raise NotFoundError("No waveform for this video")
    path = storage.path_for(asset.storage_path)
    if not path.is_file():
        raise NotFoundError("Waveform file is missing from storage")
    return FileResponse(path, media_type="application/json")


@router.delete("/videos/{video_id}", status_code=204)
def delete_video(
    video: Video = Depends(require_min_role(require_video_access, MembershipRole.EDITOR)),
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
