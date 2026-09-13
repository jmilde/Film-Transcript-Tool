from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import generate_proxy
from app.models.asset import AssetType, VideoAsset
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import find_asset, proxy_key, require_asset, require_video

# Matches the existing proxy transcode target: a source at or below this
# height plays back fine directly, so transcoding it would waste worker time
# for no playback benefit. `GET /videos/{id}/proxy` already falls back to the
# ORIGINAL asset when no PROXY exists, so skipping here needs no other change.
PROXY_SKIP_MAX_HEIGHT = 720


def handle_generate_proxy(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Transcode the original into a browser-friendly playback proxy.

    Idempotent: skip if a proxy asset already exists. Also skips (as a
    distinct no-op reason) when the source is already low enough resolution
    that a proxy wouldn't help. `video.height` is populated by the preceding
    `EXTRACT_METADATA` pipeline stage; if it's still unset here, fail open
    (transcode) rather than skip on unknown data.
    """
    video = require_video(session, job)
    if find_asset(session, video.id, AssetType.PROXY) is not None:
        return {"skipped": True, "reason": "proxy already generated"}
    if video.height is not None and video.height <= PROXY_SKIP_MAX_HEIGHT:
        return {"skipped": True, "reason": "source already <= 720p"}

    original = require_asset(session, video.id, AssetType.ORIGINAL)
    storage = factory.get_local_storage()
    key = proxy_key(video.id)
    output = storage.path_for(key)
    generate_proxy(storage.path_for(original.storage_path), output)

    size = output.stat().st_size
    session.add(
        VideoAsset(
            video_id=video.id,
            type=AssetType.PROXY,
            storage_path=key,
            mime_type="video/mp4",
            size=size,
        )
    )
    return {"storage_path": key, "size": size}
