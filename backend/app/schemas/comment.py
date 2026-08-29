import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID
    text: str


class DocumentCommentCreate(BaseModel):
    # Set when the comment pins a clipBlock node (a clip "note"); left unset
    # for a prose-text comment, whose real anchor is a `comment` mark the
    # frontend applies to the selection after this row is created.
    clip_node_id: str | None = None
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


class TranscriptCommentAnchor(BaseModel):
    kind: Literal["transcript"] = "transcript"
    transcript_id: uuid.UUID
    start_token_id: uuid.UUID
    end_token_id: uuid.UUID
    # Derived from the range's tokens (start_token.start_time / end_token.end_time),
    # in seconds; the frontend formats these into display timecodes.
    in_time: float
    out_time: float


class DocumentCommentAnchorRead(BaseModel):
    kind: Literal["document"] = "document"
    document_id: uuid.UUID
    clip_node_id: str | None
    # Resolved fresh from the document's current content, like a clip block's
    # excerpt; `None` if the anchor (clip node or comment mark) can no longer
    # be found in the content (e.g. the clip was removed from the document).
    excerpt: str | None


CommentAnchor = Annotated[
    TranscriptCommentAnchor | DocumentCommentAnchorRead, Field(discriminator="kind")
]


class CommentRead(BaseModel):
    id: uuid.UUID
    created_by: uuid.UUID
    text: str
    resolved: bool
    anchor: CommentAnchor
    created_at: datetime
    replies: list[CommentReplyRead]
