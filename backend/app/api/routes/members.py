import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_project_member, require_project_owner
from app.core.auth import get_current_user
from app.core.errors import ForbiddenError
from app.db.session import get_db
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User
from app.schemas.member import MemberInvite, MemberRead, MemberRoleUpdate
from app.services.members import (
    MemberInfo,
    get_role,
    invite_member,
    list_members,
    remove_member,
    update_member_role,
)

router = APIRouter(tags=["members"])


def _member_read(info: MemberInfo) -> MemberRead:
    return MemberRead(
        user_id=info.user.id,
        email=info.user.email,
        display_name=info.user.display_name,
        role=info.role,
    )


@router.get("/projects/{project_id}/members", response_model=list[MemberRead])
def list_project_members(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[MemberRead]:
    return [_member_read(info) for info in list_members(db, project.id)]


@router.post("/projects/{project_id}/members", response_model=MemberRead)
def invite(
    payload: MemberInvite,
    project: Project = Depends(require_project_owner),
    db: Session = Depends(get_db),
) -> MemberRead:
    info = invite_member(db, project.id, payload.email, payload.role)
    db.commit()
    return _member_read(info)


@router.patch("/projects/{project_id}/members/{user_id}", response_model=MemberRead)
def change_role(
    user_id: uuid.UUID,
    payload: MemberRoleUpdate,
    project: Project = Depends(require_project_owner),
    db: Session = Depends(get_db),
) -> MemberRead:
    membership = update_member_role(db, project.id, user_id, payload.role)
    db.commit()
    user = db.get(User, user_id)
    assert user is not None
    return _member_read(MemberInfo(user=user, role=membership.role))


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
def remove(
    user_id: uuid.UUID,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
) -> Response:
    """Remove a member, or let a member remove (leave) themselves.

    Removing *another* member requires ``OWNER``; removing yourself is always
    allowed (the service layer's last-owner guard still applies).
    """
    if user_id != caller.id and get_role(db, project.id, caller.id) != MembershipRole.OWNER:
        raise ForbiddenError("Only an owner can remove other members")
    remove_member(db, project.id, user_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
