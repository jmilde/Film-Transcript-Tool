import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.membership import MembershipRole, ProjectMembership
from app.models.user import User


class LastOwnerError(BadRequestError):
    """Raised when demoting/removing a membership would leave zero owners."""

    code = "LAST_OWNER"


@dataclass
class MemberInfo:
    user: User
    role: MembershipRole


def _get_membership(
    session: Session, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMembership:
    membership = session.execute(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise NotFoundError("This user is not a member of this project")
    return membership


def _count_owners(session: Session, project_id: uuid.UUID) -> int:
    return session.execute(
        select(func.count())
        .select_from(ProjectMembership)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.role == MembershipRole.OWNER,
        )
    ).scalar_one()


def get_role(session: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> MembershipRole | None:
    return session.execute(
        select(ProjectMembership.role).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one_or_none()


def list_members(session: Session, project_id: uuid.UUID) -> list[MemberInfo]:
    rows = session.execute(
        select(User, ProjectMembership.role)
        .join(ProjectMembership, ProjectMembership.user_id == User.id)
        .where(ProjectMembership.project_id == project_id)
        .order_by(User.email)
    ).all()
    return [MemberInfo(user=user, role=role) for user, role in rows]


def invite_member(
    session: Session, project_id: uuid.UUID, email: str, role: MembershipRole
) -> MemberInfo:
    """Add an existing user to a project by email.

    The invitee must already have signed in at least once (which is what
    JIT-provisions their local ``User`` row) — there is no pending-invite
    system in this version, so an unknown email is a clear 404 telling the
    inviter the person needs to sign in first.
    """
    invitee = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if invitee is None:
        raise NotFoundError(
            "No user found for this email; they must sign in at least once before being added"
        )
    existing = session.execute(
        select(ProjectMembership.id).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == invitee.id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise BadRequestError("This user is already a member of this project")
    session.add(ProjectMembership(project_id=project_id, user_id=invitee.id, role=role))
    session.flush()
    return MemberInfo(user=invitee, role=role)


def update_member_role(
    session: Session, project_id: uuid.UUID, user_id: uuid.UUID, role: MembershipRole
) -> ProjectMembership:
    membership = _get_membership(session, project_id, user_id)
    if (
        membership.role is MembershipRole.OWNER
        and role is not MembershipRole.OWNER
        and _count_owners(session, project_id) <= 1
    ):
        raise LastOwnerError("A project must always retain at least one owner")
    membership.role = role
    session.flush()
    return membership


def remove_member(session: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Remove a member (or let them leave via self-removal).

    Applies the same last-owner guard regardless of who is removing whom, so
    an owner can always leave a project themselves as long as another owner
    remains, but never leaves it ownerless.
    """
    membership = _get_membership(session, project_id, user_id)
    if membership.role is MembershipRole.OWNER and _count_owners(session, project_id) <= 1:
        raise LastOwnerError("A project must always retain at least one owner")
    session.delete(membership)
    session.flush()
