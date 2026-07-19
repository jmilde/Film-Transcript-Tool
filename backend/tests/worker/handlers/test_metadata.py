import pytest
from app.models.job import JobType
from app.worker.handlers.metadata import handle_extract_metadata
from app.worker.media import HandlerInputError

from tests.worker.handlers.conftest import MediaFixture


def test_extract_metadata_populates_video(media: MediaFixture) -> None:
    job = media.job(JobType.EXTRACT_METADATA)

    result = handle_extract_metadata(media.db, job)

    assert result is not None and result.get("skipped") is None
    # The handler mutates the video in place (the runner flushes/commits); assert
    # on the same identity-mapped instance rather than refreshing (which would
    # discard the not-yet-flushed changes).
    media.db.flush()
    assert media.video.width == 320
    assert media.video.height == 240
    assert media.video.duration is not None and media.video.duration > 0
    assert media.video.frame_rate == pytest.approx(25.0, abs=0.1)


def test_extract_metadata_is_idempotent(media: MediaFixture) -> None:
    media.video.duration = 42.0
    media.db.flush()
    job = media.job(JobType.EXTRACT_METADATA)

    result = handle_extract_metadata(media.db, job)

    assert result == {"skipped": True, "reason": "metadata already extracted"}
    media.db.refresh(media.video)
    assert media.video.duration == 42.0  # untouched


def test_extract_metadata_missing_original_raises(video_without_original: MediaFixture) -> None:
    job = video_without_original.job(JobType.EXTRACT_METADATA)
    with pytest.raises(HandlerInputError):
        handle_extract_metadata(video_without_original.db, job)
