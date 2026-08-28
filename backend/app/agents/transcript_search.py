"""PydanticAI agent for project-scoped semantic transcript search.

One agent, two tools: ``lookup_entities`` resolves a speaker/video/folder
name fragment to its exact form, and ``search_transcripts`` searches
transcript chunks, optionally scoped by the entities ``lookup_entities``
resolved. The agent decides when and how to re-query — there is no separate
deterministic query-reformulation step.
"""

import logging
import uuid
from dataclasses import dataclass, field

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models.video import Video
from app.services.chat_retrieval import search_chunks
from app.services.entity_lookup import (
    EntityLookupResult,
)
from app.services.entity_lookup import (
    lookup_entities as lookup_entities_service,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an assistant answering questions about a video project's transcripts. "
    "You have two tools: lookup_entities and search_transcripts.\n\n"
    "WORKFLOW: whenever the question names a specific person, video, or folder "
    "you want to scope a search to, call lookup_entities on that name FIRST — "
    "never guess the exact spelling/id yourself, it may be a typo or a partial "
    "name. Use the canonical name/id it returns as search_transcripts's "
    "speaker_name/video_id/folder_id filter argument.\n\n"
    "FILTERS VS QUERY TEXT: identity (a person's name, a video title, a folder "
    "name) must go in speaker_name/video_id/folder_id, never inside "
    "fts_query/semantic_query. Mixing a name into the query text actively "
    "hurts results — e.g. asking 'did Mariza say anything about food' by "
    "searching the text 'Mariza food' can penalize a passage that is exactly "
    "the right content ('we were in the kitchen cooking all day') just because "
    "it never literally says 'Mariza', even though her identity was never a "
    "fact the transcript text itself would contain. Resolve her name with "
    "lookup_entities, pass it as speaker_name, and search only the topic "
    "('food' / 'preparing food in the kitchen') as query text.\n\n"
    "QUERY PHRASING: semantic_query should be a natural-language phrase or "
    "sentence describing what you're looking for — it matches by meaning, "
    "across languages and paraphrases, and is worth its extra cost. "
    "fts_query should be literal keyword(s) you expect to appear verbatim — "
    "it is cheap, and you may give several keyword/synonym variations across "
    "separate calls.\n\n"
    "SEARCH BUDGET: you have a bounded number of tool calls. fts_query-only "
    "calls are cheap — feel free to try a few keyword variations and reason "
    "over the combined results. semantic_query calls cost more (an embedding "
    "call) — use them deliberately, not as repeated near-duplicate phrasings "
    "of the same idea. Don't re-run a truly duplicate query.\n\n"
    "RELEVANCE: results come back already ranked best-first, and can be in "
    "any language the project's videos use, translated or not — a good match "
    "may not share any words with your query. Each result's relevance_score "
    "is a *relative* confidence signal within that result set, not a "
    "pass/fail cutoff — a low score can still be a real, if weak, match; "
    "don't discard it outright, but hedge your answer accordingly if it's the "
    "best you have.\n\n"
    "CITATIONS: only cite chunk_ids that a tool call actually returned; never "
    "invent one. Write a concise, well-supported prose answer, and mark every "
    "claim you support with an inline bracketed number right where it "
    "appears in the text, e.g. 'The keeper lit the lamp at dusk [1].' Number "
    "markers starting at 1 in the order they first appear. Every inline "
    "marker must have a matching entry in `citations` with that same "
    "`marker` number, and every `citations` entry must be used inline at "
    "least once — don't cite something you never marked in the prose, and "
    "don't leave a marker without a matching citation. If you truly have "
    "nothing relevant after searching, say so plainly rather than continuing "
    "to search."
)

# Backstop against a runaway agent loop (e.g. ignoring the search-budget
# prompt guidance) — bounds worst-case chat latency/cost independent of
# prompt compliance. Counts every tool call this run, including the final
# ChatAnswer output call, across both tools: a lookup, several cheap FTS
# variations, a semantic call, and the final answer should all comfortably
# fit. answer_question() degrades gracefully if this is ever hit.
MAX_SEARCH_TOOL_CALLS = 10


@dataclass
class ChatDeps:
    session: Session
    project_id: uuid.UUID
    # Every chunk_id any search_transcripts call has returned this run — the
    # hallucination guard checks citations against this set.
    seen_chunk_ids: set[uuid.UUID] = field(default_factory=set)


class ChunkResult(BaseModel):
    """What the model sees for one retrieved chunk."""

    chunk_id: uuid.UUID
    video_name: str
    speaker_name: str | None
    start_time: float
    text: str
    # Relative confidence signal within this result set — not an absolute
    # pass/fail cutoff. See SYSTEM_PROMPT's RELEVANCE section.
    relevance_score: float
    # Which leg(s) found this chunk: "semantic" and/or "fts".
    matched_via: list[str]


class Citation(BaseModel):
    marker: int
    chunk_id: uuid.UUID


class ChatAnswer(BaseModel):
    answer: str
    citations: list[Citation]


def _build_model(settings: Settings) -> OpenRouterModel:
    # Constructed explicitly (not the bare "openrouter:..." string) so the key
    # comes from our Settings, not an OPENROUTER_API_KEY environment variable
    # that pydantic-settings never populates.
    model_name = settings.chat_agent_model.removeprefix("openrouter:")
    return OpenRouterModel(
        model_name, provider=OpenRouterProvider(api_key=settings.openrouter_api_key)
    )


transcript_agent = Agent(
    _build_model(get_settings()),
    deps_type=ChatDeps,
    output_type=ChatAnswer,
    system_prompt=SYSTEM_PROMPT,
)


@transcript_agent.tool
def lookup_entities(ctx: RunContext[ChatDeps], term: str) -> EntityLookupResult:
    """Resolve a speaker, video, or folder name/title fragment to its exact form.

    Call this BEFORE search_transcripts whenever the question names a
    person, video, or folder you want to scope a search to — never guess
    the exact spelling/id yourself. `term` may be a typo or partial name.
    Use the returned canonical `name` as search_transcripts's speaker_name,
    or a `video_id`/`folder_id`, as filter arguments — never put entity
    names in search_transcripts's query text.
    """
    logger.info(
        "transcript_search.lookup_entities project_id=%s term=%r", ctx.deps.project_id, term
    )
    result = lookup_entities_service(ctx.deps.session, ctx.deps.project_id, term)
    logger.info(
        "transcript_search.lookup_entities project_id=%s term=%r speakers=%d videos=%d folders=%d",
        ctx.deps.project_id,
        term,
        len(result.speakers),
        len(result.videos),
        len(result.folders),
    )
    return result


@transcript_agent.tool
def search_transcripts(
    ctx: RunContext[ChatDeps],
    fts_query: str | None = None,
    semantic_query: str | None = None,
    speaker_name: str | None = None,
    video_id: uuid.UUID | None = None,
    folder_id: uuid.UUID | None = None,
) -> list[ChunkResult]:
    """Search the project's transcripts for passages about a topic.

    Provide at least one of `fts_query`/`semantic_query`; both may be given.

    - `semantic_query`: a natural-language phrase or sentence describing
      what you're looking for, e.g. "preparing food in the kitchen" —
      matched by meaning, works across languages and paraphrases.
    - `fts_query`: literal keyword(s) you expect to appear verbatim, e.g.
      "food". Use alongside semantic_query when an exact word matters, or
      alone for a precise term — it's cheap, feel free to try a few
      keyword variations across separate calls.
    - Never put a person's name, a video title, or a folder name into
      either query string — resolve it with lookup_entities first, then
      pass it as `speaker_name`, `video_id`, or `folder_id`. Mixing entity
      names into the query text makes the ranker penalize passages that
      are correct but don't literally repeat the name.
    - `speaker_name` must be the exact canonical name from lookup_entities.
    - If both `video_id` and `folder_id` are given, `video_id` wins.

    Each result includes `relevance_score` (a relative confidence signal
    for this result set, not an absolute cutoff — a low score can still be
    a real, if weak, match) and `matched_via` (which leg(s) — "semantic"
    and/or "fts" — found it).
    """
    logger.info(
        "transcript_search.search_transcripts project_id=%s fts_query=%r semantic_query=%r "
        "speaker_name=%r video_id=%s folder_id=%s",
        ctx.deps.project_id,
        fts_query,
        semantic_query,
        speaker_name,
        video_id,
        folder_id,
    )
    matches = search_chunks(
        ctx.deps.session,
        ctx.deps.project_id,
        fts_query=fts_query,
        semantic_query=semantic_query,
        speaker_name=speaker_name,
        video_id=video_id,
        folder_id=folder_id,
    )
    ctx.deps.seen_chunk_ids.update(match.chunk.id for match in matches)
    if not matches:
        logger.info(
            "transcript_search.search_transcripts project_id=%s fts_query=%r "
            "semantic_query=%r found nothing",
            ctx.deps.project_id,
            fts_query,
            semantic_query,
        )
        return []

    video_ids = {match.chunk.video_id for match in matches}
    video_names = {
        video.id: video.name
        for video in ctx.deps.session.execute(
            select(Video).where(Video.id.in_(video_ids))
        ).scalars()
    }
    return [
        ChunkResult(
            chunk_id=match.chunk.id,
            video_name=video_names.get(match.chunk.video_id, ""),
            speaker_name=match.chunk.speaker_name,
            start_time=match.chunk.start_time,
            text=match.chunk.text,
            relevance_score=round(match.score, 3),
            matched_via=sorted(match.matched_via),
        )
        for match in matches
    ]
