import uuid

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    # Matches the Supabase auth user id (JWT `sub`); not generated locally.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    display_name: Mapped[str | None]
