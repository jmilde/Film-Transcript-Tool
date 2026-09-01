import uuid

from pydantic import BaseModel, ConfigDict

from app.models.asset import AssetType
from app.models.job import JobStatus, JobType


class VideoAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: AssetType
    storage_path: str
    mime_type: str | None
    size: int | None


class VideoJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: JobType
    status: JobStatus
    progress: int
    error_message: str | None


class FolderBreadcrumbRead(BaseModel):
    id: uuid.UUID
    name: str


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    folder_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    original_filename: str
    duration: float | None
    frame_rate: float | None
    width: int | None
    height: int | None
    assets: list[VideoAssetRead]
    jobs: list[VideoJobRead]
    # id+name (not just name) so each ancestor can be a link in the frontend's
    # breadcrumb — see `build_folder_breadcrumb_entries`.
    folder_path: list[FolderBreadcrumbRead]


class VideoUploadResponse(BaseModel):
    video_id: uuid.UUID
    processing_job_id: uuid.UUID


class VideoUpdate(BaseModel):
    folder_id: uuid.UUID | None = None


class MediaTokenResponse(BaseModel):
    token: str
    # Seconds until the token expires (clients re-fetch before playback resumes).
    expires_in: int
