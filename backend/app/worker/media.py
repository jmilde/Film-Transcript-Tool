"""Shared helpers for the media-pipeline job handlers.

Every media handler loads the job's video and its input asset the same way, and
writes derived assets under a deterministic per-video key namespace. Keeping
that here keeps the handlers themselves focused on the ffmpeg step they own.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import AssetType, VideoAsset
from app.models.job import ProcessingJob
from app.models.video import Video


class HandlerInputError(RuntimeError):
    """A media handler was invoked against a missing or invalid input.

    Raised (rather than silently no-op'ing) so the worker records the job as
    failed with a clear message instead of reporting bogus success.
    """


def require_video(session: Session, job: ProcessingJob) -> Video:
    if job.video_id is None:
        raise HandlerInputError("Job has no associated video")
    video = session.get(Video, job.video_id)
    if video is None:
        raise HandlerInputError(f"Video {job.video_id} not found")
    return video


def find_asset(session: Session, video_id: uuid.UUID, asset_type: AssetType) -> VideoAsset | None:
    return session.execute(
        select(VideoAsset).where(VideoAsset.video_id == video_id, VideoAsset.type == asset_type)
    ).scalar_one_or_none()


def require_asset(session: Session, video_id: uuid.UUID, asset_type: AssetType) -> VideoAsset:
    asset = find_asset(session, video_id, asset_type)
    if asset is None:
        raise HandlerInputError(f"Video {video_id} has no {asset_type.value} asset")
    return asset


def proxy_key(video_id: uuid.UUID) -> str:
    return f"videos/{video_id}/proxy.mp4"


def waveform_key(video_id: uuid.UUID) -> str:
    return f"videos/{video_id}/waveform.json"


def audio_key(video_id: uuid.UUID) -> str:
    return f"videos/{video_id}/audio.wav"
