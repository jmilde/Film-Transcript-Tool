import uuid

import pytest
from app.api.deps import require_folder_access, require_min_role, require_project_member
from app.core.errors import ForbiddenError, NotFoundError
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from sqlalchemy.orm import Session


def _project_with_member(
    db_session: Session, member: User, *, role: MembershipRole = MembershipRole.OWNER
) -> Project:
    project = Project(name="P", created_by=member.id, updated_by=member.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(ProjectMembership(project_id=project.id, user_id=member.id, role=role))
    db_session.flush()
    return project


def test_require_project_member_returns_project(db_session: Session, user: User) -> None:
    project = _project_with_member(db_session, user)

    result = require_project_member(project.id, db_session, user)

    assert result.id == project.id


def test_require_project_member_missing_404(db_session: Session, user: User) -> None:
    with pytest.raises(NotFoundError):
        require_project_member(uuid.uuid4(), db_session, user)


def test_require_project_member_non_member_403(
    db_session: Session, user: User, other_user: User
) -> None:
    project = _project_with_member(db_session, user)

    with pytest.raises(ForbiddenError):
        require_project_member(project.id, db_session, other_user)


def test_require_folder_access_returns_folder(db_session: Session, user: User) -> None:
    project = _project_with_member(db_session, user)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    result = require_folder_access(folder.id, db_session, user)

    assert result.id == folder.id


def test_require_folder_access_missing_404(db_session: Session, user: User) -> None:
    with pytest.raises(NotFoundError):
        require_folder_access(uuid.uuid4(), db_session, user)


def test_require_folder_access_non_member_403(
    db_session: Session, user: User, other_user: User
) -> None:
    project = _project_with_member(db_session, user)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    with pytest.raises(ForbiddenError):
        require_folder_access(folder.id, db_session, other_user)


def test_require_min_role_viewer_forbidden(db_session: Session, user: User) -> None:
    project = _project_with_member(db_session, user, role=MembershipRole.VIEWER)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    dependency = require_min_role(require_folder_access, MembershipRole.EDITOR)
    with pytest.raises(ForbiddenError):
        dependency(folder, db_session, user)


def test_require_min_role_editor_allowed(db_session: Session, user: User) -> None:
    project = _project_with_member(db_session, user, role=MembershipRole.EDITOR)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    dependency = require_min_role(require_folder_access, MembershipRole.EDITOR)

    assert dependency(folder, db_session, user).id == folder.id


def test_require_min_role_owner_allowed(db_session: Session, user: User) -> None:
    project = _project_with_member(db_session, user, role=MembershipRole.OWNER)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    dependency = require_min_role(require_folder_access, MembershipRole.EDITOR)

    assert dependency(folder, db_session, user).id == folder.id
