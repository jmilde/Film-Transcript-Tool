import pytest
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.transcript import Transcript, TranscriptToken, TranscriptType
from app.services.transcripts import create_transcript_from_normalized
from app.transcription import factory as transcription_factory  # noqa: F401  (kept for symmetry)
from app.transcription.normalize import normalize
from app.translation import factory as translation_factory
from app.worker.handlers.translate import handle_translate
from app.worker.runner import run_once
from sqlalchemy import func, select

from tests.transcription.deepgram_fixture import load_deepgram_sample
from tests.worker.handlers.conftest import MediaFixture


class _FakeTranslationProvider:
    """Deterministic stand-in for Argos/DeepL: uppercases each text."""

    def __init__(self) -> None:
        self.calls: list[tuple[tuple[str, ...], str, str]] = []

    def translate(
        self, texts: list[str], *, source_language: str, target_language: str
    ) -> list[str]:
        self.calls.append((tuple(texts), source_language, target_language))
        return [text.upper() for text in texts]


def _install_provider(monkeypatch: pytest.MonkeyPatch) -> _FakeTranslationProvider:
    provider = _FakeTranslationProvider()
    monkeypatch.setattr(translation_factory, "get_translation_provider", lambda: provider)
    return provider


def _seed_source(media: MediaFixture) -> Transcript:
    raw = load_deepgram_sample()  # language "en", 2 segments / 5 tokens
    transcript = create_transcript_from_normalized(
        media.db, media.video, normalize(raw), raw, created_by=media.video.created_by
    )
    media.db.flush()
    return transcript


def _translate_job(media: MediaFixture, source: Transcript, target_language: str) -> ProcessingJob:
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.TRANSLATE,
        status=JobStatus.PENDING,
        result={"source_transcript_id": str(source.id), "target_language": target_language},
    )
    media.db.add(job)
    media.db.flush()
    return job


def test_handle_translate_creates_translation(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _install_provider(monkeypatch)
    source = _seed_source(media)
    job = _translate_job(media, source, "es")

    result = handle_translate(media.db, job)

    assert result is not None
    assert result.get("skipped") is None
    assert result["source_transcript_id"] == str(source.id)
    assert result["target_language"] == "es"

    # The provider saw the displayed source-segment texts and the language pair.
    assert provider.calls == [(("Hello there.", "How are you?"), "en", "es")]

    translation = media.db.get(Transcript, result["transcript_id"])
    assert translation is not None
    assert translation.type is TranscriptType.TRANSLATION
    assert translation.language == "es"
    tokens = list(
        media.db.execute(
            select(TranscriptToken.original_text)
            .where(TranscriptToken.transcript_id == translation.id)
            .order_by(TranscriptToken.position)
        ).scalars()
    )
    assert "HELLO" in tokens and "THERE." in tokens


def test_handle_translate_leaves_original_untouched(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    source = _seed_source(media)
    source_token_count = media.db.execute(
        select(func.count())
        .select_from(TranscriptToken)
        .where(TranscriptToken.transcript_id == source.id)
    ).scalar_one()

    handle_translate(media.db, _translate_job(media, source, "es"))

    still = media.db.execute(
        select(func.count())
        .select_from(TranscriptToken)
        .where(TranscriptToken.transcript_id == source.id)
    ).scalar_one()
    assert still == source_token_count
    assert source.type is TranscriptType.ORIGINAL
    assert source.language == "en"


def test_handle_translate_is_idempotent(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    source = _seed_source(media)
    handle_translate(media.db, _translate_job(media, source, "es"))

    result = handle_translate(media.db, _translate_job(media, source, "es"))

    assert result is not None
    assert result["skipped"] is True
    translations = media.db.execute(
        select(func.count())
        .select_from(Transcript)
        .where(
            Transcript.video_id == media.video.id,
            Transcript.type == TranscriptType.TRANSLATION,
            Transcript.language == "es",
        )
    ).scalar_one()
    assert translations == 1


def test_run_once_drives_translate_to_completion(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    source = _seed_source(media)
    _translate_job(media, source, "es")
    media.db.commit()

    processed = run_once(media.db)

    assert processed is not None
    assert processed.type is JobType.TRANSLATE
    assert processed.status is JobStatus.COMPLETED
    assert processed.result is not None
    assert processed.result["target_language"] == "es"


def test_handle_translate_missing_fields_raises(media: MediaFixture) -> None:
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.TRANSLATE,
        status=JobStatus.PENDING,
        result=None,
    )
    media.db.add(job)
    media.db.flush()

    with pytest.raises(RuntimeError, match="target_language"):
        handle_translate(media.db, job)


def test_handle_translate_source_without_language_raises(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    source = _seed_source(media)
    source.language = None
    media.db.flush()

    with pytest.raises(RuntimeError, match="language"):
        handle_translate(media.db, _translate_job(media, source, "es"))
