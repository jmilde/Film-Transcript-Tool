import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Speaker(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A speaker within a video.

    Identities originate from the transcription provider's diarization
    (``provider_identifier``, e.g. ``speaker_0``) and are renamed by users via
    ``name``. Speakers belong to the video and are shared across its transcripts,
    so a rename propagates everywhere without touching segments/tokens.
    """

    __tablename__ = "speakers"

    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project, carried on every access-controlled row so
    # authorization is a single membership lookup. Safe: a speaker never moves.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    provider_identifier: Mapped[str | None]
    name: Mapped[str | None]
    color: Mapped[str | None]
