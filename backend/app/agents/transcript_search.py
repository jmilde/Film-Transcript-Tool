"""PydanticAI agent for project-scoped semantic transcript search.

One agent, one tool (``search_transcripts``), producing a synthesized answer
with structured citations. The agent decides when and how to re-query — there
is no separate deterministic query-reformulation step.
"""

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

SYSTEM_PROMPT = (
    "You are an assistant answering questions about a video project's transcripts. "
    "Use the search_transcripts tool to find relevant passages before answering — "
    "call it again with different phrasing if the first search doesn't turn up "
    "enough to answer confidently. Only cite chunk_ids that a tool call actually "
    "returned; never invent one. Write a concise, well-supported prose answer, and "
    "mark every claim you support with an inline bracketed number right where it "
    "appears in the text, e.g. 'The keeper lit the lamp at dusk [1].' Number "
    "markers starting at 1 in the order they first appear. Every inline marker "
    "must have a matching entry in `citations` with that same `marker` number, "
    "and every `citations` entry must be used inline at least once — don't cite "
    "something you never marked in the prose, and don't leave a marker without a "
    "matching citation."
)


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
def search_transcripts(ctx: RunContext[ChatDeps], query: str) -> list[ChunkResult]:
    """Search the project's video transcripts for passages relevant to `query`."""
    chunks = search_chunks(ctx.deps.session, ctx.deps.project_id, query)
    ctx.deps.seen_chunk_ids.update(chunk.id for chunk in chunks)
    if not chunks:
        return []

    video_ids = {chunk.video_id for chunk in chunks}
    video_names = {
        video.id: video.name
        for video in ctx.deps.session.execute(
            select(Video).where(Video.id.in_(video_ids))
        ).scalars()
    }
    return [
        ChunkResult(
            chunk_id=chunk.id,
            video_name=video_names.get(chunk.video_id, ""),
            speaker_name=chunk.speaker_name,
            start_time=chunk.start_time,
            text=chunk.text,
        )
        for chunk in chunks
    ]
