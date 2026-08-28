import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChatCitation(BaseModel):
    """The persisted citation shape plus response-time-only display fields.

    ``thumbnail_token`` and ``folder_path`` are never stored on
    ``ChatMessage.citations`` — like ``search.py``'s ``SearchVideoGroup``, a
    media token is short-lived and a breadcrumb can go stale, so both are
    computed fresh by the route on every read.
    """

    marker: int
    chunk_id: uuid.UUID
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


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    citations: list[ChatCitation] | None
    created_at: datetime


class ChatAskRequest(BaseModel):
    question: str
    conversation_id: uuid.UUID | None = None


class ChatAskResponse(BaseModel):
    conversation_id: uuid.UUID
    message: ChatMessageRead


class ChatConversationSummary(BaseModel):
    """One row in a project's conversation history list — no messages."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
