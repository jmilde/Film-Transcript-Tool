import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Video(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    __tablename__ = "videos"

    folder_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    original_filename: Mapped[str]
    duration: Mapped[float | None]
    frame_rate: Mapped[float | None]
    width: Mapped[int | None]
    height: Mapped[int | None]
