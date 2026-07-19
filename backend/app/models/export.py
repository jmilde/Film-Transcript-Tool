import enum
import uuid

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class ExportType(enum.StrEnum):
    MARKDOWN = "markdown"
    SRT = "srt"


class Export(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """A requested transcript export and, once rendered, its generated file.

    The row is created when a user asks for an export (``storage_path`` null) and
    a driving ``ProcessingJob`` renders the file and stamps ``storage_path`` in.
    Export has no status of its own — the job carries pending/running/completed;
    a null ``storage_path`` simply means the file is not ready yet.
    """

    __tablename__ = "exports"

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization, matching every other
    # access-controlled row.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[ExportType] = mapped_column(
        Enum(ExportType, native_enum=False, values_callable=lambda e: [m.value for m in e])
    )
    # Storage key for the rendered file; null until the worker finishes.
    storage_path: Mapped[str | None]
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
