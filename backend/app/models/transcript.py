import enum
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import Enum, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class TranscriptType(enum.StrEnum):
    ORIGINAL = "original"
    TRANSLATION = "translation"


class Transcript(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One language version of a video's spoken content.

    A video may hold several transcripts (the original plus translations); each
    is edited independently and can be regenerated without affecting the others.
    """

    __tablename__ = "transcripts"

    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str | None]
    type: Mapped[TranscriptType] = mapped_column(
        Enum(TranscriptType, native_enum=False, values_callable=lambda e: [m.value for m in e])
    )
    # Raw provider JSON, kept separate from the normalized model for debugging /
    # reprocessing (only populated for originals, never for translations).
    provider_raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))


class TranscriptSegment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A readable block of speech grouping tokens under one speaker.

    Segments are a display/structural unit, not the editable unit; a segment
    boundary marks a speaker change or structural break, which is why tokens
    cannot be merged across segments.
    """

    __tablename__ = "transcript_segments"

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    speaker_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("speakers.id", ondelete="SET NULL"), index=True
    )
    # Fractional ordering within the transcript; NUMERIC lets edits insert
    # between existing positions without renumbering.
    position: Mapped[Decimal] = mapped_column(Numeric)


class TranscriptToken(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    """The smallest editable transcript unit — initially one provider word.

    Editing is non-destructive: ``edited_text`` overlays ``original_text`` for
    display, deletion is the soft ``is_deleted`` flag, and merge/split create
    replacement tokens rather than mutating the originals.
    """

    __tablename__ = "transcript_tokens"

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    segment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization on token-level edits.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    original_text: Mapped[str]
    edited_text: Mapped[str | None]
    start_time: Mapped[float]
    end_time: Mapped[float]
    is_deleted: Mapped[bool] = mapped_column(default=False)
    # Fractional ordering within the segment; NUMERIC lets merge/split insert
    # replacement tokens between existing positions without renumbering.
    position: Mapped[Decimal] = mapped_column(Numeric)
