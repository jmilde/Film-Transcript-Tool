import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FolderCreate(BaseModel):
    name: str
    parent_folder_id: uuid.UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_folder_id: uuid.UUID | None = None


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_folder_id: uuid.UUID | None
    name: str
    created_at: datetime
    updated_at: datetime


class VideoSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class FolderContents(BaseModel):
    folder: FolderRead
    folders: list[FolderRead]
    videos: list[VideoSummary]
