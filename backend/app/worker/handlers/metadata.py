from typing import Any

from sqlalchemy.orm import Session

from app.media.ffmpeg import probe
from app.models.asset import AssetType
from app.models.job import ProcessingJob
from app.storage import factory
from app.worker.media import require_asset, require_video


def handle_extract_metadata(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Probe the original media and persist duration/resolution/frame rate.

    Idempotent: if the video already has a duration (a prior run succeeded),
    skip rather than re-probe.
    """
    video = require_video(session, job)
    if video.duration is not None:
        return {"skipped": True, "reason": "metadata already extracted"}

    original = require_asset(session, video.id, AssetType.ORIGINAL)
    result = probe(factory.get_local_storage().path_for(original.storage_path))

    video.duration = result.duration
    video.frame_rate = result.frame_rate
    video.width = result.width
    video.height = result.height

    return {
        "duration": result.duration,
        "width": result.width,
        "height": result.height,
        "frame_rate": result.frame_rate,
        "video_codec": result.video_codec,
        "audio_codec": result.audio_codec,
        "has_audio": result.has_audio,
    }
