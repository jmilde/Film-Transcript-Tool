import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.transcript import TranscriptType


class TranscriptSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    video_id: uuid.UUID
    language: str | None
    type: TranscriptType
    created_at: datetime


class TokenRead(BaseModel):
    id: uuid.UUID
    segment_id: uuid.UUID
    original_text: str
    edited_text: str | None
    # Display text: edited_text if present, otherwise original_text.
    text: str
    start_time: float
    end_time: float


class SegmentRead(BaseModel):
    id: uuid.UUID
    # Tokens inherit their speaker through the segment; the frontend joins this
    # against GET /videos/{id}/speakers so a speaker rename propagates for free.
    speaker_id: uuid.UUID | None
    tokens: list[TokenRead]


class TranscriptRead(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    language: str | None
    type: TranscriptType
    created_at: datetime
    segments: list[SegmentRead]


class TranslationCreate(BaseModel):
    # ISO 639-1 language code to translate into (e.g. "en"). Version 1 ships the
    # Spanish->English Argos model; other pairs work once their model is present.
    target_language: str


class TranslationResponse(BaseModel):
    job_id: uuid.UUID
