from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin):
    __tablename__ = "projects"

    name: Mapped[str]
    description: Mapped[str | None]
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
