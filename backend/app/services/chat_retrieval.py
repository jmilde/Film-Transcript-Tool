"""Hybrid (vector + full-text) retrieval over a project's transcript chunks.

Two cheap, independently-triggerable recall legs (ANN + FTS) are unioned and
handed to a reranker for a single relevance ordering, then every winning
chunk is resolved back to the original-language transcript's chunk for the
same moment — citations always point at the original, even when a
translation chunk scored best (matches ``VideoWorkspace.tsx``'s "left pane
always shows the original" convention).

How this covers multiple languages, e.g. a Spanish original plus its English
translation:

- Every ``Transcript`` (original *and* each translation) is chunked and
  embedded independently (``app/worker/handlers/embed.py``) — a project's
  ``transcript_chunks`` table holds rows in every language it has content for.
- ``semantic_query`` is embedded once and compared by cosine distance against
  *all* of a project's chunk embeddings regardless of language (the ANN leg
  below). This is what makes an English question findable against
  Spanish-only content and vice versa: the embedding model maps semantically
  similar text close together across languages, not just within one.
- The FTS leg is a cheap literal-keyword net alongside ANN, not a language-
  aware one — see the comment above ``tsquery`` below for why it uses
  Postgres's "simple" config rather than a stemmed one.
- Whichever chunk wins (original or translation), ``_resolve_to_original``
  maps it back to the original-language transcript's overlapping chunk before
  it's cited, so the user always jumps to the source-language passage.

``fts_query``/``semantic_query`` are independent and optional (at least one
is required) so a caller can search text-only, semantic-only, or both with
differently-phrased queries — literal keywords rarely make a good semantic
phrase and vice versa. ``speaker_name``/``video_id``/``folder_id`` are
structural SQL filters, entirely separate from query text, so identity never
has to be folded into (and pollute) the search text.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.embeddings import factory as embeddings_factory
from app.models.embedding import TranscriptChunk
from app.models.transcript import Transcript, TranscriptType
from app.reranking import factory as reranking_factory
from app.services.folders import resolve_descendant_video_ids

logger = logging.getLogger(__name__)

# Recall width for each leg before reranking narrows to the final answer set.
ANN_CANDIDATES = 20
FTS_CANDIDATES = 20
# How many reranked chunks the agent's tool call sees.
RERANK_TOP_K = 8

# Pre-rerank recall-quality cutoff on the raw ANN leg only: an embedding this
# far (cosine distance — 0 identical, 2 opposite) from the query vector never
# even enters the candidate pool. This is independent of, and not a
# replacement for, exposing `relevance_score` on the *final* reranked list —
# no cutoff exists or should exist there (a low-scoring rerank result can
# still be a real, if weak, match; see TODO_AGENT_SEARCH.md). The value below
# is a starting guess, not yet tuned against this project's actual
# embedding-distance distribution — watch observed ANN-leg distances for real
# queries for a while (or promote this to a `Settings` field so it can be
# adjusted without a deploy) before trusting it blindly.
ANN_MAX_COSINE_DISTANCE = 0.5


@dataclass
class ChunkMatch:
    """One retrieved chunk plus its rerank score and which leg(s) found it."""

    chunk: TranscriptChunk
    score: float
    matched_via: frozenset[str]  # {"semantic"} | {"fts"} | {"semantic", "fts"}


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


def _resolve_to_original(session: Session, ranked_matches: list[ChunkMatch]) -> list[ChunkMatch]:
    if not ranked_matches:
        return []

    transcript_ids = {match.chunk.transcript_id for match in ranked_matches}
    transcript_types: dict[uuid.UUID, TranscriptType] = {
        row.id: row.type
        for row in session.execute(
            select(Transcript.id, Transcript.type).where(Transcript.id.in_(transcript_ids))
        )
    }

    video_ids = {match.chunk.video_id for match in ranked_matches}
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

    resolved: list[ChunkMatch] = []
    index_by_id: dict[uuid.UUID, int] = {}
    for match in ranked_matches:
        target = match.chunk
        if transcript_types.get(match.chunk.transcript_id) is TranscriptType.TRANSLATION:
            overlap = _best_overlapping_original(
                originals_by_video.get(match.chunk.video_id, []), match.chunk
            )
            if overlap is not None:
                target = overlap

        existing_index = index_by_id.get(target.id)
        if existing_index is None:
            index_by_id[target.id] = len(resolved)
            resolved.append(
                ChunkMatch(chunk=target, score=match.score, matched_via=match.matched_via)
            )
        else:
            # Two translation-chunk winners collapsed onto the same original
            # chunk — keep the stronger score and the union of how each was
            # found, rather than just first-wins dedup.
            existing = resolved[existing_index]
            resolved[existing_index] = ChunkMatch(
                chunk=existing.chunk,
                score=max(existing.score, match.score),
                matched_via=existing.matched_via | match.matched_via,
            )
    return resolved


def search_chunks(
    session: Session,
    project_id: uuid.UUID,
    *,
    fts_query: str | None = None,
    semantic_query: str | None = None,
    speaker_name: str | None = None,
    video_id: uuid.UUID | None = None,
    folder_id: uuid.UUID | None = None,
) -> list[ChunkMatch]:
    """Retrieve the most relevant original-language chunks matching the given queries.

    At least one of ``fts_query``/``semantic_query`` is required (``ValueError``
    otherwise); either or both may be given, independently phrased. Each leg
    only runs if its query param is given — no embedding-API call happens
    when ``semantic_query`` is ``None``.

    ``speaker_name``/``video_id``/``folder_id`` are structural filters applied
    to both legs equally, never part of the query text. If both ``video_id``
    and ``folder_id`` are given, ``video_id`` wins; a ``folder_id`` that
    resolves to no videos anywhere in its subtree short-circuits to ``[]``.

    Reranks the union of both legs' candidates against ``semantic_query`` if
    given, else ``fts_query``, and resolves each winner to its
    original-language chunk. Returns highest-ranked first.
    """
    if fts_query is None and semantic_query is None:
        raise ValueError("At least one of fts_query or semantic_query is required")

    filters: list[ColumnElement[bool]] = [TranscriptChunk.project_id == project_id]
    if speaker_name is not None:
        filters.append(TranscriptChunk.speaker_name == speaker_name)
    if video_id is not None:
        filters.append(TranscriptChunk.video_id == video_id)
    elif folder_id is not None:
        descendant_video_ids = resolve_descendant_video_ids(session, folder_id)
        if not descendant_video_ids:
            return []
        filters.append(TranscriptChunk.video_id.in_(descendant_video_ids))

    candidates: dict[uuid.UUID, TranscriptChunk] = {}
    matched_via: dict[uuid.UUID, frozenset[str]] = {}

    ann_candidates: list[TranscriptChunk] = []
    if semantic_query is not None:
        embeddings_provider = embeddings_factory.get_embeddings_provider()
        (query_vector,) = embeddings_provider.embed([semantic_query])
        distance = TranscriptChunk.embedding.cosine_distance(query_vector)
        ann_candidates = list(
            session.execute(
                select(TranscriptChunk)
                .where(*filters, distance < ANN_MAX_COSINE_DISTANCE)
                .order_by(distance)
                .limit(ANN_CANDIDATES)
            ).scalars()
        )
        for chunk in ann_candidates:
            candidates.setdefault(chunk.id, chunk)
            matched_via[chunk.id] = matched_via.get(chunk.id, frozenset()) | {"semantic"}

    fts_candidates: list[TranscriptChunk] = []
    if fts_query is not None:
        # "simple" does no stemming — it case-folds and tokenizes but never
        # maps a word to its stem. That has to match how embed.py built
        # search_vector: to_tsvector and to_tsquery only find each other
        # under the SAME config, and a stemmed config (e.g. "english")
        # produces different lexemes than "simple" for the same word
        # (to_tsvector('english', 'minerals') -> the stem 'miner', but
        # plainto_tsquery('simple', 'minerals') stays 'minerals' — those
        # never satisfy `@@`). Since one query here must be able to match
        # chunks in any of a project's languages, both sides use "simple" so
        # this leg is a plain literal/substring-of-tokens match instead of a
        # silently-broken per-language one.
        tsquery = func.plainto_tsquery("simple", fts_query)
        fts_candidates = list(
            session.execute(
                select(TranscriptChunk)
                .where(*filters, TranscriptChunk.search_vector.op("@@")(tsquery))
                .limit(FTS_CANDIDATES)
            ).scalars()
        )
        for chunk in fts_candidates:
            candidates.setdefault(chunk.id, chunk)
            matched_via[chunk.id] = matched_via.get(chunk.id, frozenset()) | {"fts"}

    logger.info(
        "chat_retrieval.search_chunks project_id=%s fts_query=%r semantic_query=%r "
        "ann=%d fts=%d union=%d",
        project_id,
        fts_query,
        semantic_query,
        len(ann_candidates),
        len(fts_candidates),
        len(candidates),
    )
    if not candidates:
        return []

    if semantic_query is not None:
        rerank_query = semantic_query
    else:
        # Guaranteed non-None: the top-of-function check already ruled out
        # both being None, and the `if` above ruled out semantic_query.
        assert fts_query is not None
        rerank_query = fts_query

    candidate_list = list(candidates.values())
    rerank_provider = reranking_factory.get_rerank_provider()
    scores = rerank_provider.rerank(rerank_query, [chunk.text for chunk in candidate_list])
    ranked_with_scores = sorted(
        zip(candidate_list, scores, strict=True), key=lambda pair: pair[1], reverse=True
    )[:RERANK_TOP_K]
    ranked = [
        ChunkMatch(chunk=chunk, score=score, matched_via=matched_via[chunk.id])
        for chunk, score in ranked_with_scores
    ]
    logger.info(
        "chat_retrieval.search_chunks project_id=%s reranked top %d of %d: %s",
        project_id,
        len(ranked),
        len(candidate_list),
        [
            (match.chunk.id, match.chunk.language, round(match.score, 3), sorted(match.matched_via))
            for match in ranked
        ],
    )

    resolved = _resolve_to_original(session, ranked)
    logger.info(
        "chat_retrieval.search_chunks project_id=%s resolved %d chunk(s) to original transcripts",
        project_id,
        len(resolved),
    )
    return resolved
