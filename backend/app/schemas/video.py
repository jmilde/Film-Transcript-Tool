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


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    folder_id: uuid.UUID
    name: str
    original_filename: str
    duration: float | None
    frame_rate: float | None
    width: int | None
    height: int | None
    assets: list[VideoAssetRead]
    jobs: list[VideoJobRead]


class VideoUploadResponse(BaseModel):
    video_id: uuid.UUID
    processing_job_id: uuid.UUID
