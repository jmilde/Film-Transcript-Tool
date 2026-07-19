from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import generate_waveform
from app.models.asset import AssetType, VideoAsset
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import find_asset, require_asset, require_video, waveform_key


def handle_generate_waveform(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Generate downsampled waveform peaks for the timeline display.

    Idempotent: skip if a waveform asset already exists.
    """
    video = require_video(session, job)
    if find_asset(session, video.id, AssetType.WAVEFORM) is not None:
        return {"skipped": True, "reason": "waveform already generated"}

    original = require_asset(session, video.id, AssetType.ORIGINAL)
    storage = factory.get_local_storage()
    key = waveform_key(video.id)
    output = storage.path_for(key)
    data = generate_waveform(storage.path_for(original.storage_path), output)

    size = output.stat().st_size
    session.add(
        VideoAsset(
            video_id=video.id,
            type=AssetType.WAVEFORM,
            storage_path=key,
            mime_type="application/json",
            size=size,
        )
    )
    return {"storage_path": key, "peak_count": len(data.peaks), "size": size}
