import uuid
from typing import Any

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Document(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    """A user-authored document mixing prose with embedded clip blocks.

    ``content`` is the TipTap/ProseMirror document tree as opaque JSON — prose
    nodes plus custom ``clipBlock`` nodes referencing a transcript token range.
    There is no separate block/position table: a rich-text tree doesn't fit the
    flat fractional-``position`` pattern used by ``TranscriptSegment``/
    ``TranscriptToken``, and there's in-repo precedent for storing an editor's
    own opaque JSON blob (``ChatConversation.agent_message_history``). A clip
    block's excerpt/timecodes/etc. are never stored in ``content`` — they are
    resolved fresh from the referenced tokens on every read.

    ``version`` is a whole-document optimistic-locking counter (mirrors
    ``TranscriptToken.version``): every ``PATCH`` must supply the version it
    last saw or the write is rejected with a 409 rather than silently
    overwriting a concurrent edit.
    """

    __tablename__ = "documents"

    # Denormalized owning project for O(1) authorization.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str]
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(default=1, server_default="1")
