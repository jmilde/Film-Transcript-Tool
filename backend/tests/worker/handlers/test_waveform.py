import json

from app.models.asset import AssetType
from app.models.job import JobType
from app.worker.handlers.waveform import handle_generate_waveform
from app.worker.media import find_asset

from tests.worker.handlers.conftest import MediaFixture


def test_generate_waveform_writes_peaks_asset(media: MediaFixture) -> None:
    job = media.job(JobType.GENERATE_WAVEFORM)

    result = handle_generate_waveform(media.db, job)

    assert result is not None and result["peak_count"] > 0
    asset = find_asset(media.db, media.video.id, AssetType.WAVEFORM)
    assert asset is not None
    assert asset.storage_path == f"videos/{media.video.id}/waveform.json"
    assert asset.mime_type == "application/json"

    payload = json.loads(media.storage.path_for(asset.storage_path).read_text())
    assert payload["version"] == 1
    assert len(payload["peaks"]) == result["peak_count"]
    assert max(payload["peaks"]) > 0.0  # the tone is audible


def test_generate_waveform_is_idempotent(media: MediaFixture) -> None:
    handle_generate_waveform(media.db, media.job(JobType.GENERATE_WAVEFORM))

    result = handle_generate_waveform(media.db, media.job(JobType.GENERATE_WAVEFORM))

    assert result == {"skipped": True, "reason": "waveform already generated"}
