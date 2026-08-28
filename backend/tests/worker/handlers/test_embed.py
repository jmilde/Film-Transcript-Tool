import uuid
from decimal import Decimal
from typing import Any

import pytest
from app.embeddings import factory as embeddings_factory
from app.models.embedding import EMBEDDING_DIMENSION, TranscriptChunk
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from app.worker.handlers.embed import MAX_CHUNK_CHARS, handle_generate_embeddings
from sqlalchemy import func, select

from tests.transcription.deepgram_fixture import load_deepgram_sample
from tests.worker.handlers.conftest import MediaFixture


class _FakeEmbeddingsProvider:
    """Deterministic stand-in: each vector's first component is its position."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[float(i)] * EMBEDDING_DIMENSION for i in range(len(texts))]


def _install_provider(monkeypatch: pytest.MonkeyPatch) -> _FakeEmbeddingsProvider:
    provider = _FakeEmbeddingsProvider()
    monkeypatch.setattr(embeddings_factory, "get_embeddings_provider", lambda: provider)
    return provider


def _seed_source(media: MediaFixture) -> Transcript:
    raw = load_deepgram_sample()  # language "en", 2 segments / 5 tokens
    transcript = create_transcript_from_normalized(
        media.db, media.video, normalize(raw), raw, created_by=media.video.created_by
    )
    media.db.flush()
    return transcript


def _embed_job(
    media: MediaFixture, transcript: Transcript, *, force: bool = False
) -> ProcessingJob:
    result: dict[str, Any] = {"transcript_id": str(transcript.id)}
    if force:
        result["force"] = True
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.GENERATE_EMBEDDINGS,
        status=JobStatus.PENDING,
        result=result,
    )
    media.db.add(job)
    media.db.flush()
    return job


def _make_transcript(media: MediaFixture, *, language: str | None) -> Transcript:
    transcript = Transcript(
        video_id=media.video.id,
        project_id=media.video.project_id,
        language=language,
        type=TranscriptType.ORIGINAL,
        created_by=media.video.created_by,
    )
    media.db.add(transcript)
    media.db.flush()
    return transcript


def _add_segment_with_words(
    media: MediaFixture,
    transcript: Transcript,
    words: list[str],
    *,
    position: int,
    speaker_id: object = None,
) -> TranscriptSegment:
    segment = TranscriptSegment(
        transcript_id=transcript.id,
        speaker_id=speaker_id,
        position=Decimal(position),
    )
    media.db.add(segment)
    media.db.flush()
    for index, word in enumerate(words):
        media.db.add(
            TranscriptToken(
                transcript_id=transcript.id,
                segment_id=segment.id,
                project_id=media.video.project_id,
                original_text=word,
                start_time=float(index),
                end_time=float(index) + 0.5,
                position=Decimal(index + 1),
                created_by=media.video.created_by,
                updated_by=media.video.created_by,
            )
        )
    media.db.flush()
    return segment


def _chunks_for(media: MediaFixture, transcript: Transcript) -> list[TranscriptChunk]:
    return list(
        media.db.execute(
            select(TranscriptChunk)
            .where(TranscriptChunk.transcript_id == transcript.id)
            .order_by(TranscriptChunk.segment_id, TranscriptChunk.chunk_index)
        ).scalars()
    )


def test_handle_generate_embeddings_creates_one_chunk_per_segment(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _install_provider(monkeypatch)
    transcript = _seed_source(media)

    result = handle_generate_embeddings(media.db, _embed_job(media, transcript))

    assert result is not None
    assert result.get("skipped") is None
    assert result["transcript_id"] == str(transcript.id)
    assert result["chunk_count"] == 2

    chunks = _chunks_for(media, transcript)
    assert len(chunks) == 2
    assert provider.calls == [["Hello there.", "How are you?"]]
    for chunk in chunks:
        assert chunk.video_id == media.video.id
        assert chunk.project_id == media.video.project_id
        assert chunk.language == "en"
        assert chunk.chunk_index == 0
        assert chunk.embedding_model
        assert len(chunk.embedding) == EMBEDDING_DIMENSION
    assert {chunk.text for chunk in chunks} == {"Hello there.", "How are you?"}


def test_handle_generate_embeddings_search_vector_ignores_transcript_language(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """search_vector always uses the "simple" config, regardless of language.

    chat_retrieval.py's FTS leg queries every chunk in a project — spanning
    however many languages it has content in — with one ``plainto_tsquery``,
    so storage must use the same config the query side does (see the comment
    on ``_SEARCH_VECTOR_CONFIG`` in ``embed.py`` for why a stemmed,
    language-specific config would silently break that).
    """
    _install_provider(monkeypatch)
    transcript = _make_transcript(media, language="es")
    _add_segment_with_words(media, transcript, ["corriendo"], position=1)

    handle_generate_embeddings(media.db, _embed_job(media, transcript))

    def matches(config: str, term: str) -> bool:
        return bool(
            media.db.execute(
                select(func.count())
                .select_from(TranscriptChunk)
                .where(
                    TranscriptChunk.transcript_id == transcript.id,
                    TranscriptChunk.search_vector.op("@@")(func.to_tsquery(config, term)),
                )
            ).scalar_one()
        )

    # The literal, unstemmed token matches under "simple"...
    assert matches("simple", "corriendo")
    # ...but not its Spanish stem, because "simple" never stems.
    assert not matches("spanish", "correr")


def test_handle_generate_embeddings_splits_long_segment(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    transcript = _make_transcript(media, language="en")
    # ~900 chars of words, well past the 800-char sub-split threshold, plus a
    # second, short segment that must stay a single chunk.
    long_words = [f"word{i:03d}" for i in range(130)]
    long_segment = _add_segment_with_words(media, transcript, long_words, position=1)
    _add_segment_with_words(media, transcript, ["short", "segment"], position=2)

    result = handle_generate_embeddings(media.db, _embed_job(media, transcript))

    assert result is not None
    assert result["chunk_count"] >= 3  # multiple sub-chunks for the long segment + the short one

    chunks = _chunks_for(media, transcript)
    long_chunks = [c for c in chunks if c.segment_id == long_segment.id]
    short_chunks = [c for c in chunks if c.segment_id != long_segment.id]

    assert len(long_chunks) > 1
    assert [c.chunk_index for c in long_chunks] == list(range(len(long_chunks)))
    for chunk in long_chunks:
        assert len(chunk.text) <= MAX_CHUNK_CHARS
    # Chunks are contiguous and non-overlapping: each one's end token is the
    # token immediately before the next chunk's start token.
    all_text = " ".join(chunk.text for chunk in long_chunks)
    assert all_text == " ".join(long_words)

    assert len(short_chunks) == 1
    assert short_chunks[0].chunk_index == 0
    assert short_chunks[0].text == "short segment"


def test_handle_generate_embeddings_uses_speaker_name(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_provider(monkeypatch)
    transcript = _make_transcript(media, language="en")
    speaker = Speaker(video_id=media.video.id, project_id=media.video.project_id, name="Alice")
    media.db.add(speaker)
    media.db.flush()
    _add_segment_with_words(media, transcript, ["hi"], position=1, speaker_id=speaker.id)

    handle_generate_embeddings(media.db, _embed_job(media, transcript))

    chunks = _chunks_for(media, transcript)
    assert chunks[0].speaker_name == "Alice"


def test_handle_generate_embeddings_is_idempotent(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _install_provider(monkeypatch)
    transcript = _seed_source(media)
    handle_generate_embeddings(media.db, _embed_job(media, transcript))

    result = handle_generate_embeddings(media.db, _embed_job(media, transcript))

    assert result is not None
    assert result["skipped"] is True
    assert len(provider.calls) == 1
    assert len(_chunks_for(media, transcript)) == 2


def test_handle_generate_embeddings_force_recreates_chunks(
    media: MediaFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _install_provider(monkeypatch)
    transcript = _seed_source(media)
    handle_generate_embeddings(media.db, _embed_job(media, transcript))
    first_ids = {chunk.id for chunk in _chunks_for(media, transcript)}

    result = handle_generate_embeddings(media.db, _embed_job(media, transcript, force=True))

    assert result is not None
    assert result.get("skipped") is None
    assert result["chunk_count"] == 2
    assert len(provider.calls) == 2
    second_ids = {chunk.id for chunk in _chunks_for(media, transcript)}
    assert first_ids.isdisjoint(second_ids)


def test_handle_generate_embeddings_missing_transcript_id_raises(media: MediaFixture) -> None:
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.GENERATE_EMBEDDINGS,
        status=JobStatus.PENDING,
        result=None,
    )
    media.db.add(job)
    media.db.flush()

    with pytest.raises(RuntimeError, match="transcript_id"):
        handle_generate_embeddings(media.db, job)


def test_handle_generate_embeddings_missing_transcript_raises(media: MediaFixture) -> None:
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.GENERATE_EMBEDDINGS,
        status=JobStatus.PENDING,
        result={"transcript_id": str(uuid.uuid4())},
    )
    media.db.add(job)
    media.db.flush()

    with pytest.raises(RuntimeError, match="no longer exists"):
        handle_generate_embeddings(media.db, job)
