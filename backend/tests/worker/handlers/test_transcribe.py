from pathlib import Path
from typing import Any

import pytest
from app.models.job import JobType, ProcessingJob
from app.models.transcript import Transcript, TranscriptToken, TranscriptType
from app.transcription import factory as transcription_factory
from app.worker.handlers.transcribe import handle_transcribe
from app.worker.media import HandlerInputError, audio_key
from sqlalchemy import func, select

from tests.transcription.deepgram_fixture import load_deepgram_sample
from tests.worker.handlers.conftest import MediaFixture


class _FakeProvider:
    """Stands in for Deepgram: returns the saved fixture without a network call."""

    def __init__(self, response: dict[str, Any]) -> None:
        self._response = response
        self.calls: list[Path] = []

    def transcribe(self, audio_path: Path) -> dict[str, Any]:
        self.calls.append(audio_path)
        return self._response


def _seed_audio(media: MediaFixture) -> None:
    media.storage.path_for(audio_key(media.video.id)).write_bytes(b"RIFFfake-wav")


def _install_provider(monkeypatch: pytest.MonkeyPatch, response: dict[str, Any]) -> _FakeProvider:
    provider = _FakeProvider(response)
    monkeypatch.setattr(transcription_factory, "get_transcription_provider", lambda: provider)
    return provider


def test_transcribe_populates_transcript(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed_audio(media)
    provider = _install_provider(monkeypatch, load_deepgram_sample())
    job = media.job(JobType.TRANSCRIBE)

    result = handle_transcribe(media.db, job)

    assert result is not None
    assert result.get("skipped") is None
    assert result["segment_count"] == 2
    assert result["token_count"] == 5
    assert result["language"] == "en"
    # The extracted audio (not the video) was sent to the provider.
    assert provider.calls == [media.storage.path_for(audio_key(media.video.id))]

    transcript = media.db.get(Transcript, result["transcript_id"])
    assert transcript is not None
    assert transcript.type is TranscriptType.ORIGINAL
    token_count = media.db.execute(
        select(func.count())
        .select_from(TranscriptToken)
        .where(TranscriptToken.transcript_id == transcript.id)
    ).scalar_one()
    assert token_count == 5

    # A fresh transcript enqueues its own embedding job so it's searchable
    # without a manual reindex.
    embed_job = media.db.execute(
        select(ProcessingJob).where(
            ProcessingJob.type == JobType.GENERATE_EMBEDDINGS,
            ProcessingJob.video_id == media.video.id,
        )
    ).scalar_one()
    assert embed_job.project_id == media.video.project_id
    assert embed_job.result == {"transcript_id": str(transcript.id)}


def test_transcribe_is_idempotent(media: MediaFixture, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_audio(media)
    _install_provider(monkeypatch, load_deepgram_sample())
    handle_transcribe(media.db, media.job(JobType.TRANSCRIBE))

    result = handle_transcribe(media.db, media.job(JobType.TRANSCRIBE))

    assert result is not None
    assert result["skipped"] is True
    # Still exactly one original transcript for the video.
    originals = media.db.execute(
        select(func.count())
        .select_from(Transcript)
        .where(
            Transcript.video_id == media.video.id,
            Transcript.type == TranscriptType.ORIGINAL,
        )
    ).scalar_one()
    assert originals == 1
    # Skip path: only the first (real) transcription enqueued an embedding job.
    embed_job_count = media.db.execute(
        select(func.count())
        .select_from(ProcessingJob)
        .where(
            ProcessingJob.type == JobType.GENERATE_EMBEDDINGS,
            ProcessingJob.video_id == media.video.id,
        )
    ).scalar_one()
    assert embed_job_count == 1


def test_transcribe_missing_audio_raises(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch, load_deepgram_sample())
    # No audio seeded → handler must fail loudly rather than call the provider.
    with pytest.raises(HandlerInputError):
        handle_transcribe(media.db, media.job(JobType.TRANSCRIBE))
