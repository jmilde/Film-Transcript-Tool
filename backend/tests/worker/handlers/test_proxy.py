from app.media.ffmpeg import probe
from app.models.asset import AssetType, VideoAsset
from app.models.job import JobType
from app.worker.handlers.proxy import handle_generate_proxy
from app.worker.media import find_asset
from sqlalchemy import func, select

from tests.worker.handlers.conftest import MediaFixture


def test_generate_proxy_creates_playable_asset(media: MediaFixture) -> None:
    job = media.job(JobType.GENERATE_PROXY)

    result = handle_generate_proxy(media.db, job)

    assert result is not None
    asset = find_asset(media.db, media.video.id, AssetType.PROXY)
    assert asset is not None
    assert asset.storage_path == f"videos/{media.video.id}/proxy.mp4"
    assert asset.mime_type == "video/mp4"
    assert asset.size is not None and asset.size > 0
    # The written file is real, valid H.264.
    assert probe(media.storage.path_for(asset.storage_path)).video_codec == "h264"


def test_generate_proxy_is_idempotent(media: MediaFixture) -> None:
    handle_generate_proxy(media.db, media.job(JobType.GENERATE_PROXY))

    result = handle_generate_proxy(media.db, media.job(JobType.GENERATE_PROXY))

    assert result == {"skipped": True, "reason": "proxy already generated"}
    # Still exactly one proxy asset — the second run did not create a duplicate.
    count = media.db.execute(
        select(func.count())
        .select_from(VideoAsset)
        .where(VideoAsset.video_id == media.video.id, VideoAsset.type == AssetType.PROXY)
    ).scalar_one()
    assert count == 1
