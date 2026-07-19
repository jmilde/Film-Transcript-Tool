import uuid
from io import BytesIO
from typing import Any

from sqlalchemy.orm import Session

from app.models.export import Export
from app.models.job import ProcessingJob
from app.models.transcript import Transcript
from app.services.exports import build_export_document, export_key, render_export
from app.storage import factory as storage_factory


def handle_export(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Render the requested export file and record its storage key.

    The driving job carries the target export id in ``result`` (set when the
    export was requested). This loads the export, renders the transcript's
    current visible content, writes the file to storage, and stamps
    ``storage_path`` on the export row so downloads stop returning 404.
    """
    export_id = (job.result or {}).get("export_id")
    if export_id is None:
        raise RuntimeError("Export job is missing its export_id")
    export = session.get(Export, uuid.UUID(str(export_id)))
    if export is None:
        raise RuntimeError(f"Export {export_id} not found")
    transcript = session.get(Transcript, export.transcript_id)
    if transcript is None:
        raise RuntimeError(f"Transcript {export.transcript_id} not found")

    document = build_export_document(session, transcript)
    content = render_export(document, export.type)

    key = export_key(export.id, export.type)
    storage = storage_factory.get_local_storage()
    storage.save(key, BytesIO(content.encode("utf-8")))
    export.storage_path = key

    return {"export_id": str(export.id), "storage_path": key}
