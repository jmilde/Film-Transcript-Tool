import enum
import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class MembershipRole(enum.StrEnum):
    """A member's permission tier on a project.

    Kept on ``ProjectMembership`` (not named ``ProjectRole``) and the
    membership-check helpers kept composable so a future multi-tenant
    ``Organization`` layer can reuse the same shape without renaming this.
    """

    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class ProjectMembership(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "project_memberships"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[MembershipRole] = mapped_column(
        Enum(MembershipRole, native_enum=False, values_callable=lambda e: [m.value for m in e])
    )
