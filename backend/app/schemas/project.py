import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.membership import MembershipRole


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    archived: bool | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    my_role: MembershipRole
    video_count: int
    member_count: int
    document_count: int
