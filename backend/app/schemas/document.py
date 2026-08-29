import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DocumentCreate(BaseModel):
    title: str


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: dict[str, Any] | None = None
    expected_version: int


class DocumentSummary(BaseModel):
    """List-view shape — no ``content``, keeping the panel's document switcher cheap."""

    id: uuid.UUID
    title: str
    updated_at: datetime


class DocumentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    # Every clipBlock node's attrs are augmented with resolved display fields
    # (see ClipBlockRead) on every read; never persisted in this shape.
    content: dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime


class ClipBlockResolveRequest(BaseModel):
    transcript_id: uuid.UUID
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID


class ClipBlockRead(BaseModel):
    """A clip block's resolved display fields, mirroring ``ChatCitation``.

    Resolved fresh from the referenced tokens on every read — nothing here is
    persisted on ``Document.content``, so the excerpt can't drift from edits
    made to the source transcript.
    """

    transcript_id: uuid.UUID
    video_id: uuid.UUID
    video_name: str
    segment_id: uuid.UUID
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID
    start_time: float
    end_time: float
    speaker_name: str | None
    language: str | None
    excerpt: str
    thumbnail_token: str | None
    folder_path: list[str]
