import uuid
from typing import Any

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ChatConversation(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    """A semantic-search chat thread scoped to one project.

    ``agent_message_history`` is PydanticAI's own serialized ``ModelMessage``
    list (opaque to the frontend), fed back into the agent on the next turn so
    it remembers what it already searched. Display content lives on
    ``ChatMessage`` instead.
    """

    __tablename__ = "chat_conversations"

    # Denormalized owning project for O(1) authorization.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None]
    agent_message_history: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class ChatMessage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One turn (user question or assistant answer) in a chat conversation.

    ``citations`` is assistant-only: our own display-shaped payload the
    frontend reads to render preview cards, distinct from
    ``ChatConversation.agent_message_history``.
    """

    __tablename__ = "chat_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str]
    content: Mapped[str]
    citations: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
