"""Chunk a transcript, embed each chunk, and persist searchable rows.

One chunk per ``TranscriptSegment``, sub-split into consecutive same-segment
chunks for segments whose displayed text runs long — see
``app/models/embedding.py`` for why the chunk shape looks the way it does.
"""

import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.embeddings import factory as embeddings_factory
from app.models.embedding import TranscriptChunk
from app.models.job import ProcessingJob
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken

# Segments whose joined displayed text exceeds this many characters are split
# into multiple same-segment chunks, so no single embedding call sees an
# oversized passage. There is no cross-segment windowing or overlap.
MAX_CHUNK_CHARS = 800

# `search_vector` always uses Postgres's "simple" config (no stemming), even
# though a chunk's own language is known. A project's chunks span multiple
# languages (an original plus its translations), and chat_retrieval.py's FTS
# leg has to query all of them with one `tsquery` — it can't know in advance
# which language a match will come from. `to_tsvector` and `to_tsquery` must
# agree on config or `@@` silently never matches: e.g. `to_tsvector('english',
# 'minerals')` stems to the lexeme `miner`, but `plainto_tsquery('simple',
# 'minerals')` stays `minerals` — those never match. Using "simple" (literal,
# case-folded tokens) on both sides keeps FTS language-agnostic; stemming/
# fuzzy matching across languages is the vector (ANN) leg's job, not FTS's.
_SEARCH_VECTOR_CONFIG = "simple"


def _display_text(token: TranscriptToken) -> str:
    return token.edited_text if token.edited_text is not None else token.original_text


def _split_tokens(tokens: list[TranscriptToken]) -> list[list[TranscriptToken]]:
    """Greedily pack a segment's tokens into <=``MAX_CHUNK_CHARS`` groups.

    A single token longer than the limit still gets its own group rather than
    being split mid-word.
    """
    groups: list[list[TranscriptToken]] = []
    current: list[TranscriptToken] = []
    current_len = 0
    for token in tokens:
        text_len = len(_display_text(token))
        added = text_len + (1 if current else 0)  # +1 for the joining space
        if current and current_len + added > MAX_CHUNK_CHARS:
            groups.append(current)
            current = []
            current_len = 0
            added = text_len
        current.append(token)
        current_len += added
    if current:
        groups.append(current)
    return groups


def handle_generate_embeddings(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Build/refresh ``TranscriptChunk`` rows for one transcript.

    Reads ``transcript_id``/``force`` from ``job.result`` (same pre-set-input
    idiom as ``translate.py``). Idempotent: if chunks already exist for the
    transcript and ``force`` is falsy, skip; if ``force``, existing chunks are
    deleted and rebuilt from scratch.
    """
    data = job.result or {}
    transcript_id = data.get("transcript_id")
    force = bool(data.get("force", False))
    if transcript_id is None:
        raise RuntimeError("Embedding job is missing transcript_id")

    transcript = session.get(Transcript, uuid.UUID(str(transcript_id)))
    if transcript is None:
        raise RuntimeError(f"Transcript {transcript_id} for embedding no longer exists")

    existing_count = session.execute(
        select(func.count())
        .select_from(TranscriptChunk)
        .where(TranscriptChunk.transcript_id == transcript.id)
    ).scalar_one()
    if existing_count > 0 and not force:
        return {
            "skipped": True,
            "reason": "chunks already exist",
            "transcript_id": str(transcript.id),
            "chunk_count": existing_count,
        }
    if existing_count > 0:
        session.execute(
            delete(TranscriptChunk).where(TranscriptChunk.transcript_id == transcript.id)
        )
        session.flush()

    segments = list(
        session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        ).scalars()
    )
    tokens = list(
        session.execute(
            select(TranscriptToken)
            .where(
                TranscriptToken.transcript_id == transcript.id,
                TranscriptToken.is_deleted.is_(False),
            )
            .order_by(TranscriptToken.position)
        ).scalars()
    )
    tokens_by_segment: dict[uuid.UUID, list[TranscriptToken]] = {}
    for token in tokens:
        tokens_by_segment.setdefault(token.segment_id, []).append(token)

    speaker_ids = {segment.speaker_id for segment in segments if segment.speaker_id is not None}
    speaker_names: dict[uuid.UUID, str | None] = {}
    if speaker_ids:
        speaker_names = {
            speaker.id: speaker.name
            for speaker in session.execute(
                select(Speaker).where(Speaker.id.in_(speaker_ids))
            ).scalars()
        }

    pending: list[tuple[TranscriptSegment, int, list[TranscriptToken], str]] = []
    for segment in segments:
        segment_tokens = tokens_by_segment.get(segment.id, [])
        if not segment_tokens:
            continue
        for chunk_index, group in enumerate(_split_tokens(segment_tokens)):
            text = " ".join(_display_text(token) for token in group)
            pending.append((segment, chunk_index, group, text))

    if not pending:
        return {"transcript_id": str(transcript.id), "chunk_count": 0}

    provider = embeddings_factory.get_embeddings_provider()
    vectors = provider.embed([text for *_, text in pending])

    settings = get_settings()
    for (segment, chunk_index, group, text), vector in zip(pending, vectors, strict=True):
        session.add(
            TranscriptChunk(
                transcript_id=transcript.id,
                video_id=transcript.video_id,
                project_id=transcript.project_id,
                language=transcript.language,
                segment_id=segment.id,
                start_token_id=group[0].id,
                end_token_id=group[-1].id,
                start_time=group[0].start_time,
                end_time=group[-1].end_time,
                speaker_name=speaker_names.get(segment.speaker_id) if segment.speaker_id else None,
                chunk_index=chunk_index,
                text=text,
                search_vector=func.to_tsvector(_SEARCH_VECTOR_CONFIG, text),
                embedding=vector,
                embedding_model=settings.embeddings_model,
            )
        )
    session.flush()

    return {"transcript_id": str(transcript.id), "chunk_count": len(pending)}
