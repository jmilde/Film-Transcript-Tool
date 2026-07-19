import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class AssetType(enum.StrEnum):
    ORIGINAL = "original"
    PROXY = "proxy"
    WAVEFORM = "waveform"
    THUMBNAIL = "thumbnail"


class VideoAsset(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "video_assets"
    __table_args__ = (Index("ix_video_assets_video_id_type", "video_id", "type"),)

    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"))
    type: Mapped[AssetType] = mapped_column(
        Enum(AssetType, native_enum=False, values_callable=lambda e: [m.value for m in e])
    )
    # Logical storage identifier, never an absolute filesystem path.
    storage_path: Mapped[str]
    mime_type: Mapped[str | None]
    size: Mapped[int | None]
