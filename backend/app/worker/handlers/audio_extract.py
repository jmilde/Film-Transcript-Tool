from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import extract_audio
from app.models.asset import AssetType
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import audio_key, require_asset, require_video


def handle_extract_audio(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Extract the audio track for transcription (Deepgram, next stage).

    There is no ``audio`` asset type (Phase 4 adds no schema); the extracted
    file lives at a deterministic per-video key, so idempotency is a storage
    existence check rather than an asset-row lookup.
    """
    video = require_video(session, job)
    storage = factory.get_local_storage()
    key = audio_key(video.id)
    if storage.exists(key):
        return {"skipped": True, "reason": "audio already extracted", "storage_path": key}

    original = require_asset(session, video.id, AssetType.ORIGINAL)
    output = storage.path_for(key)
    extract_audio(storage.path_for(original.storage_path), output)

    return {"storage_path": key, "size": output.stat().st_size}
