import uuid

from sqlalchemy import CheckConstraint, Computed, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Comment(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    """A note attached to either a transcript token range or a document.

    Exactly one of ``transcript_id``/``document_id`` is set (enforced by a
    ``CheckConstraint``) — a comment is polymorphic over its anchor, not two
    separate entities, so a single comments UI/query can list both. For a
    transcript comment, the token range lives in ``CommentRange``; for a
    document comment, the anchor lives in ``DocumentCommentAnchor``. Threaded
    replies (``CommentReply``) are shared by both. In/out timecodes for a
    transcript comment are not stored — they are derived from the range's
    tokens on read, so the comment follows edits to those tokens.
    """

    __tablename__ = "comments"
    __table_args__ = (
        # GIN index powering project search on comment text.
        Index("ix_comments_search_vector", "search_vector", postgresql_using="gin"),
        CheckConstraint(
            "(transcript_id IS NULL) != (document_id IS NULL)",
            name="exactly_one_anchor",
        ),
    )

    transcript_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization. Safe: a comment never
    # moves between projects.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str]
    resolved: Mapped[bool] = mapped_column(default=False)
    # Full-text vector over the comment text, maintained by Postgres as a stored
    # generated column.
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', text)", persisted=True),
    )


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


class DocumentCommentAnchor(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Where a document-anchored comment attaches within the document.

    ``clip_node_id`` is set when the comment is pinned to a ``clipBlock``
    node's stable ``nodeId`` attribute (a "note" on a clip). It is ``None``
    when the comment is anchored to a run of prose text instead — that case's
    real position anchor is a TipTap ``comment`` mark carrying this row's
    ``comment_id``, living in the document's own JSON content tree rather than
    a relational column, since prose position must ride ProseMirror's
    transaction mapping through edits exactly like the mark's other data.
    """

    __tablename__ = "document_comment_anchors"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), unique=True, index=True
    )
    clip_node_id: Mapped[str | None] = mapped_column(default=None)


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
