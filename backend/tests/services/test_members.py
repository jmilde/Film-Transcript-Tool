import uuid

import pytest
from app.core.errors import BadRequestError, NotFoundError
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.services.members import (
    LastOwnerError,
    invite_member,
    list_members,
    remove_member,
    update_member_role,
)
from sqlalchemy import select
from sqlalchemy.orm import Session


def _project_with_owner(db: Session, owner: User) -> Project:
    project = Project(name="P", created_by=owner.id, updated_by=owner.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=owner.id, role=MembershipRole.OWNER))
    db.flush()
    return project


def _make_user(db: Session, email: str) -> User:
    new_user = User(id=uuid.uuid4(), email=email)
    db.add(new_user)
    db.flush()
    return new_user


def test_list_members_returns_all(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)
    editor = _make_user(db_session, "editor@example.com")
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=editor.id, role=MembershipRole.EDITOR)
    )
    db_session.flush()

    members = list_members(db_session, project.id)

    roles = {info.user.email: info.role for info in members}
    assert roles == {user.email: MembershipRole.OWNER, editor.email: MembershipRole.EDITOR}


def test_invite_member_adds_existing_user(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)
    invitee = _make_user(db_session, "invitee@example.com")

    info = invite_member(db_session, project.id, invitee.email, MembershipRole.EDITOR)

    assert info.user.id == invitee.id
    assert info.role is MembershipRole.EDITOR


def test_invite_member_unknown_email_404(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(NotFoundError):
        invite_member(db_session, project.id, "nobody@example.com", MembershipRole.VIEWER)


def test_invite_member_already_a_member_rejected(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(BadRequestError):
        invite_member(db_session, project.id, user.email, MembershipRole.VIEWER)


def test_update_member_role_changes_role(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)
    other = _make_user(db_session, "other@example.com")
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=other.id, role=MembershipRole.VIEWER)
    )
    db_session.flush()

    membership = update_member_role(db_session, project.id, other.id, MembershipRole.EDITOR)

    assert membership.role is MembershipRole.EDITOR


def test_update_member_role_last_owner_demote_rejected(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(LastOwnerError):
        update_member_role(db_session, project.id, user.id, MembershipRole.EDITOR)


def test_update_member_role_demote_allowed_with_second_owner(
    db_session: Session, user: User
) -> None:
    project = _project_with_owner(db_session, user)
    other = _make_user(db_session, "other@example.com")
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=other.id, role=MembershipRole.OWNER)
    )
    db_session.flush()

    membership = update_member_role(db_session, project.id, user.id, MembershipRole.EDITOR)

    assert membership.role is MembershipRole.EDITOR


def test_update_member_role_not_found(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(NotFoundError):
        update_member_role(db_session, project.id, uuid.uuid4(), MembershipRole.EDITOR)


def test_remove_member_last_owner_rejected(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(LastOwnerError):
        remove_member(db_session, project.id, user.id)


def test_remove_member_self_leave_allowed_with_second_owner(
    db_session: Session, user: User
) -> None:
    project = _project_with_owner(db_session, user)
    other = _make_user(db_session, "other@example.com")
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=other.id, role=MembershipRole.OWNER)
    )
    db_session.flush()

    remove_member(db_session, project.id, user.id)

    remaining = (
        db_session.execute(
            select(ProjectMembership).where(ProjectMembership.project_id == project.id)
        )
        .scalars()
        .all()
    )
    assert [m.user_id for m in remaining] == [other.id]


def test_remove_member_not_found(db_session: Session, user: User) -> None:
    project = _project_with_owner(db_session, user)

    with pytest.raises(NotFoundError):
        remove_member(db_session, project.id, uuid.uuid4())
