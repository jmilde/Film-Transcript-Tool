"""Hybrid (vector + full-text) retrieval over a project's transcript chunks.

Two cheap recall legs (ANN + FTS) are unioned and handed to a reranker for a
single relevance ordering, then every winning chunk is resolved back to the
original-language transcript's chunk for the same moment — citations always
point at the original, even when a translation chunk scored best (matches
``VideoWorkspace.tsx``'s "left pane always shows the original" convention).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.embeddings import factory as embeddings_factory
from app.models.embedding import TranscriptChunk
from app.models.transcript import Transcript, TranscriptType
from app.reranking import factory as reranking_factory

# Recall width for each leg before reranking narrows to the final answer set.
ANN_CANDIDATES = 20
FTS_CANDIDATES = 20
# How many reranked chunks the agent's tool call sees.
RERANK_TOP_K = 8


def _best_overlapping_original(
    originals: list[TranscriptChunk], chunk: TranscriptChunk
) -> TranscriptChunk | None:
    """The original-transcript chunk whose time range overlaps ``chunk`` most.

    Translation segments are independently timed (interpolated over the
    source segment's duration), so ranges rarely align exactly — this picks
    the best match rather than requiring an exact one. ``None`` if nothing
    overlaps at all, e.g. the original hasn't been embedded yet.
    """
    best: TranscriptChunk | None = None
    best_overlap = 0.0
    for candidate in originals:
        overlap_start = max(candidate.start_time, chunk.start_time)
        overlap_end = min(candidate.end_time, chunk.end_time)
        overlap = overlap_end - overlap_start
        if overlap > best_overlap:
            best_overlap = overlap
            best = candidate
    return best


def _resolve_to_original(
    session: Session, ranked_chunks: list[TranscriptChunk]
) -> list[TranscriptChunk]:
    if not ranked_chunks:
        return []

    transcript_ids = {chunk.transcript_id for chunk in ranked_chunks}
    transcript_types: dict[uuid.UUID, TranscriptType] = {
        row.id: row.type
        for row in session.execute(
            select(Transcript.id, Transcript.type).where(Transcript.id.in_(transcript_ids))
        )
    }

    video_ids = {chunk.video_id for chunk in ranked_chunks}
    originals_by_video: dict[uuid.UUID, list[TranscriptChunk]] = {}
    for original_chunk in session.execute(
        select(TranscriptChunk)
        .join(Transcript, Transcript.id == TranscriptChunk.transcript_id)
        .where(
            TranscriptChunk.video_id.in_(video_ids),
            Transcript.type == TranscriptType.ORIGINAL,
        )
    ).scalars():
        originals_by_video.setdefault(original_chunk.video_id, []).append(original_chunk)

    resolved: list[TranscriptChunk] = []
    seen_ids: set[uuid.UUID] = set()
    for chunk in ranked_chunks:
        target = chunk
        if transcript_types.get(chunk.transcript_id) is TranscriptType.TRANSLATION:
            match = _best_overlapping_original(originals_by_video.get(chunk.video_id, []), chunk)
            if match is not None:
                target = match
        if target.id in seen_ids:
            continue
        seen_ids.add(target.id)
        resolved.append(target)
    return resolved


def search_chunks(session: Session, project_id: uuid.UUID, query: str) -> list[TranscriptChunk]:
    """Retrieve the most relevant original-language chunks for ``query``.

    Embeds ``query`` for an ANN search and also runs it as a plain-text FTS
    search, scoped to ``project_id``; unions the two candidate sets by chunk
    id, reranks the union, and resolves each winner to its original-language
    chunk. Returns highest-ranked first.
    """
    embeddings_provider = embeddings_factory.get_embeddings_provider()
    (query_vector,) = embeddings_provider.embed([query])

    ann_candidates = session.execute(
        select(TranscriptChunk)
        .where(TranscriptChunk.project_id == project_id)
        .order_by(TranscriptChunk.embedding.cosine_distance(query_vector))
        .limit(ANN_CANDIDATES)
    ).scalars()

    # 'simple' does no stemming, so this leg matches literal tokens
    # regardless of which language config a chunk's search_vector used.
    tsquery = func.plainto_tsquery("simple", query)
    fts_candidates = session.execute(
        select(TranscriptChunk)
        .where(
            TranscriptChunk.project_id == project_id,
            TranscriptChunk.search_vector.op("@@")(tsquery),
        )
        .limit(FTS_CANDIDATES)
    ).scalars()

    candidates: dict[uuid.UUID, TranscriptChunk] = {}
    for chunk in (*ann_candidates, *fts_candidates):
        candidates.setdefault(chunk.id, chunk)
    if not candidates:
        return []

    candidate_list = list(candidates.values())
    rerank_provider = reranking_factory.get_rerank_provider()
    scores = rerank_provider.rerank(query, [chunk.text for chunk in candidate_list])
    ranked = [
        chunk
        for chunk, _score in sorted(
            zip(candidate_list, scores, strict=True), key=lambda pair: pair[1], reverse=True
        )
    ][:RERANK_TOP_K]

    return _resolve_to_original(session, ranked)
