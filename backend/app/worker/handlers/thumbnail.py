from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import generate_thumbnail
from app.models.asset import AssetType, VideoAsset
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import find_asset, require_asset, require_video, thumbnail_key


def handle_generate_thumbnail(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Grab a representative frame from the video for search-result cards.

    Idempotent: skip if a thumbnail asset already exists.
    """
    video = require_video(session, job)
    if find_asset(session, video.id, AssetType.THUMBNAIL) is not None:
        return {"skipped": True, "reason": "thumbnail already generated"}

    original = require_asset(session, video.id, AssetType.ORIGINAL)
    storage = factory.get_local_storage()
    key = thumbnail_key(video.id)
    output = storage.path_for(key)
    generate_thumbnail(storage.path_for(original.storage_path), output, video.duration or 0.0)

    size = output.stat().st_size
    session.add(
        VideoAsset(
            video_id=video.id,
            type=AssetType.THUMBNAIL,
            storage_path=key,
            mime_type="image/jpeg",
            size=size,
        )
    )
    return {"storage_path": key, "size": size}
