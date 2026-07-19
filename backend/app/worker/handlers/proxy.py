from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import generate_proxy
from app.models.asset import AssetType, VideoAsset
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import find_asset, proxy_key, require_asset, require_video


def handle_generate_proxy(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Transcode the original into a browser-friendly playback proxy.

    Idempotent: skip if a proxy asset already exists.
    """
    video = require_video(session, job)
    if find_asset(session, video.id, AssetType.PROXY) is not None:
        return {"skipped": True, "reason": "proxy already generated"}

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
