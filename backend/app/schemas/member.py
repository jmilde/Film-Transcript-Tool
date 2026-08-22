import uuid

from pydantic import BaseModel

from app.models.membership import MembershipRole


class MemberRead(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str | None
    role: MembershipRole


class MemberInvite(BaseModel):
    email: str
    role: MembershipRole


class MemberRoleUpdate(BaseModel):
    role: MembershipRole
