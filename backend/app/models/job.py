import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class JobType(enum.StrEnum):
    EXTRACT_METADATA = "extract_metadata"
    GENERATE_PROXY = "generate_proxy"
    GENERATE_THUMBNAIL = "generate_thumbnail"
    GENERATE_WAVEFORM = "generate_waveform"
    EXTRACT_AUDIO = "extract_audio"
    TRANSCRIBE = "transcribe"
    TRANSLATE = "translate"
    GENERATE_EMBEDDINGS = "generate_embeddings"
    EXPORT = "export"
    NOOP = "noop"


class JobStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingJob(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """A row in the Postgres-backed job queue.

    Workers poll for ``pending`` rows, claim them with ``FOR UPDATE SKIP
    LOCKED``, and drive them ``pending -> running -> completed|failed``.
    """

    __tablename__ = "processing_jobs"

    # Nullable so jobs not tied to a single video (future non-media jobs, and
    # the noop smoke-test job) can exist; cascades when the video is deleted.
    video_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization (nullable to match
    # video_id — a project-less job cannot be authorized and reads as 404).
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[JobType] = mapped_column(
        Enum(JobType, native_enum=False, values_callable=lambda e: [m.value for m in e])
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=JobStatus.PENDING,
        index=True,
    )
    progress: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None]
    # Generic pointer to what a completed job produced, e.g. {"export_id": ...}.
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
