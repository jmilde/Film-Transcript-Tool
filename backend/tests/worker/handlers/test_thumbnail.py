from app.models.asset import AssetType
from app.models.job import JobType
from app.worker.handlers.thumbnail import handle_generate_thumbnail
from app.worker.media import find_asset

from tests.worker.handlers.conftest import MediaFixture


def test_generate_thumbnail_writes_jpeg_asset(media: MediaFixture) -> None:
    job = media.job(JobType.GENERATE_THUMBNAIL)

    result = handle_generate_thumbnail(media.db, job)

    assert result is not None and result["size"] > 0
    asset = find_asset(media.db, media.video.id, AssetType.THUMBNAIL)
    assert asset is not None
    assert asset.storage_path == f"videos/{media.video.id}/thumbnail.jpg"
    assert asset.mime_type == "image/jpeg"
    assert media.storage.path_for(asset.storage_path).stat().st_size > 0


def test_generate_thumbnail_is_idempotent(media: MediaFixture) -> None:
    handle_generate_thumbnail(media.db, media.job(JobType.GENERATE_THUMBNAIL))

    result = handle_generate_thumbnail(media.db, media.job(JobType.GENERATE_THUMBNAIL))

    assert result == {"skipped": True, "reason": "thumbnail already generated"}
