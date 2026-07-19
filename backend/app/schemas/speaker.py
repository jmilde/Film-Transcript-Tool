import uuid

from pydantic import BaseModel, ConfigDict


class SpeakerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    video_id: uuid.UUID
    provider_identifier: str | None
    name: str | None
    color: str | None


class SpeakerUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
