from app.media.ffmpeg import probe
from app.models.job import JobType
from app.worker.handlers.audio_extract import handle_extract_audio
from app.worker.media import audio_key

from tests.worker.handlers.conftest import MediaFixture


def test_extract_audio_writes_wav(media: MediaFixture) -> None:
    job = media.job(JobType.EXTRACT_AUDIO)

    result = handle_extract_audio(media.db, job)

    assert result is not None
    key = audio_key(media.video.id)
    assert result["storage_path"] == key
    assert media.storage.exists(key)
    extracted = probe(media.storage.path_for(key))
    assert extracted.has_audio is True
    assert extracted.audio_codec == "pcm_s16le"


def test_extract_audio_is_idempotent(media: MediaFixture) -> None:
    handle_extract_audio(media.db, media.job(JobType.EXTRACT_AUDIO))

    result = handle_extract_audio(media.db, media.job(JobType.EXTRACT_AUDIO))

    assert result is not None and result["skipped"] is True
