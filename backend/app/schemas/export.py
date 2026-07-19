import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.export import ExportType


class ExportCreate(BaseModel):
    format: ExportType


class ExportCreateResponse(BaseModel):
    export_id: uuid.UUID
    processing_job_id: uuid.UUID


class ExportRead(BaseModel):
    id: uuid.UUID
    transcript_id: uuid.UUID
    type: ExportType
    # True once the worker has rendered the file; until then downloads 404.
    ready: bool
    created_at: datetime
