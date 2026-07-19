import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Comment(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    """A note attached to a range of transcript tokens.

    The comment stores only its text and resolution state; the token range it
    points at lives in ``CommentRange`` and its threaded replies in
    ``CommentReply``. In/out timecodes are not stored — they are derived from the
    range's tokens on read, so the comment follows edits to those tokens.
    """

    __tablename__ = "comments"

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization. Safe: a comment never
    # moves between projects.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str]
    resolved: Mapped[bool] = mapped_column(default=False)


class CommentRange(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """The transcript token span a comment is anchored to.

    A range is defined by its first and last token; the comment's displayed
    in/out timecodes come from ``start_token.start_time`` and
    ``end_token.end_time``. Tokens are never hard-deleted (edits soft-delete),
    so the anchor stays valid across editing.
    """

    __tablename__ = "comment_ranges"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), index=True
    )
    start_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_tokens.id", ondelete="CASCADE")
    )
    end_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_tokens.id", ondelete="CASCADE")
    )


class CommentReply(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """A reply in a comment's thread.

    Replies are immutable (create-only), so they carry ``created_by``/
    ``created_at`` but no update audit columns.
    """

    __tablename__ = "comment_replies"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str]
