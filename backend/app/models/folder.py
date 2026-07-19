import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Folder(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    __tablename__ = "folders"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    # Null means the folder sits directly inside the project.
    parent_folder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
