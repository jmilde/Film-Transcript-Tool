import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Video(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    __tablename__ = "videos"

    folder_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project, carried on every access-controlled row so
    # authorization is a single membership lookup rather than a walk up the tree.
    # Safe to denormalize: a video never moves between projects.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    original_filename: Mapped[str]
    duration: Mapped[float | None]
    frame_rate: Mapped[float | None]
    width: Mapped[int | None]
    height: Mapped[int | None]
