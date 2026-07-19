import uuid
from datetime import datetime

from pydantic import BaseModel


class CommentCreate(BaseModel):
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID
    text: str


class CommentReplyCreate(BaseModel):
    text: str


class CommentUpdate(BaseModel):
    # Only resolution is mutable via PATCH; optional so an absent field is a no-op.
    resolved: bool | None = None


class CommentReplyRead(BaseModel):
    id: uuid.UUID
    created_by: uuid.UUID
    text: str
    created_at: datetime


class CommentRead(BaseModel):
    id: uuid.UUID
    transcript_id: uuid.UUID
    created_by: uuid.UUID
    text: str
    resolved: bool
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID
    # Derived from the range's tokens (start_token.start_time / end_token.end_time),
    # in seconds; the frontend formats these into display timecodes.
    in_time: float
    out_time: float
    created_at: datetime
    replies: list[CommentReplyRead]
