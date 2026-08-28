"""Orchestrates one chat turn: run the agent, guard citations, persist messages.

``stream_answer_question`` is the one real implementation — an async
generator that yields ``{"type": "status", ...}`` progress events while the
agent searches, then a single terminal event. ``answer_question`` is a thin
synchronous wrapper over it (for tests and any non-streaming caller) that
just discards the progress events and returns the final message.
"""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterable, AsyncIterator
from typing import Any, cast

from pydantic_ai import ModelMessagesTypeAdapter, RunContext
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import (
    AgentStreamEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ToolReturnPart,
)
from pydantic_ai.usage import UsageLimits
from sqlalchemy.orm import Session

from app.agents.transcript_search import (
    MAX_SEARCH_TOOL_CALLS,
    ChatDeps,
    ChunkResult,
    Citation,
    transcript_agent,
)
from app.core.errors import NotFoundError
from app.models.chat import ChatConversation, ChatMessage
from app.models.embedding import TranscriptChunk
from app.models.video import Video
from app.services.entity_lookup import EntityLookupResult

logger = logging.getLogger(__name__)

# How much of the first question to keep as a conversation's list-view title.
TITLE_MAX_CHARS = 60


def _derive_title(question: str) -> str:
    """A conversation's title is its first question, truncated for list display."""
    collapsed = " ".join(question.split())
    if len(collapsed) <= TITLE_MAX_CHARS:
        return collapsed
    return collapsed[:TITLE_MAX_CHARS].rstrip() + "…"


def _resolve_citation(session: Session, citation: Citation) -> dict[str, Any] | None:
    """Expand a bare (marker, chunk_id) citation into its display payload.

    ``None`` if the chunk has since been deleted (e.g. a reindex raced the
    citation) — the caller drops those rather than persisting a broken link.
    """
    chunk = session.get(TranscriptChunk, citation.chunk_id)
    if chunk is None:
        return None
    video = session.get(Video, chunk.video_id)
    return {
        "marker": citation.marker,
        "chunk_id": str(chunk.id),
        "transcript_id": str(chunk.transcript_id),
        "video_id": str(chunk.video_id),
        "video_name": video.name if video is not None else "",
        "segment_id": str(chunk.segment_id),
        "start_token_id": str(chunk.start_token_id),
        "end_token_id": str(chunk.end_token_id),
        "start_time": chunk.start_time,
        "end_time": chunk.end_time,
        "speaker_name": chunk.speaker_name,
        "language": chunk.language,
        "excerpt": chunk.text,
    }


async def stream_answer_question(
    session: Session,
    project_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    question: str,
    *,
    user_id: uuid.UUID,
) -> AsyncIterator[dict[str, Any]]:
    """Run one chat turn, yielding progress, then persist it.

    Multi-turn continuity comes from ``ChatConversation.agent_message_history``
    (PydanticAI's own serialized message list), fed back into the agent as
    ``message_history`` so it remembers what it already searched.

    Yields ``{"type": "status", "message": str}`` once per search the agent
    runs (so the UI can show "Searching for ...” live), then exactly one
    terminal event:

    - ``{"type": "done", "conversation_id": uuid.UUID, "assistant_message": ChatMessage}``
      — the turn is persisted (caller still needs to commit).
    - ``{"type": "error", "message": str}`` — the run failed outright; nothing
      is persisted and the caller should roll back rather than commit.
    """
    if conversation_id is not None:
        conversation = session.get(ChatConversation, conversation_id)
        if conversation is None or conversation.project_id != project_id:
            raise NotFoundError("Conversation not found")
    else:
        conversation = ChatConversation(
            project_id=project_id,
            title=_derive_title(question),
            created_by=user_id,
            updated_by=user_id,
        )
        session.add(conversation)
        session.flush()

    message_history = None
    if conversation.agent_message_history is not None:
        message_history = ModelMessagesTypeAdapter.validate_python(
            conversation.agent_message_history["messages"]
        )

    logger.info(
        "chat.ask project_id=%s conversation_id=%s question=%r",
        project_id,
        conversation.id,
        question,
    )

    deps = ChatDeps(session=session, project_id=project_id)
    # search_transcripts's own logging captures the query/results; this only
    # needs to know a search *started*, to relay to the UI as it happens.
    status_queue: asyncio.Queue[str | None] = asyncio.Queue()

    # Call-started args, keyed by tool_call_id, so the later result-summary
    # event (which only carries the return value, not the original args) can
    # still report what a lookup_entities call searched for.
    pending_call_terms: dict[str, str] = {}

    async def on_events(ctx: RunContext[ChatDeps], events: AsyncIterable[AgentStreamEvent]) -> None:
        async for event in events:
            if isinstance(event, FunctionToolCallEvent):
                if event.part.tool_name == "search_transcripts":
                    args = event.part.args_as_dict()
                    query = args.get("semantic_query") or args.get("fts_query") or ""
                    active_filters = [
                        f"speaker {args['speaker_name']!r}" if args.get("speaker_name") else None,
                        "this video" if args.get("video_id") else None,
                        "this folder" if args.get("folder_id") else None,
                    ]
                    filter_suffix = ""
                    filter_bits = [bit for bit in active_filters if bit is not None]
                    if filter_bits:
                        filter_suffix = f" (scoped to {', '.join(filter_bits)})"
                    await status_queue.put(f'Searching for "{query}"{filter_suffix}…')
                elif event.part.tool_name == "lookup_entities":
                    term = event.part.args_as_dict().get("term", "")
                    pending_call_terms[event.part.tool_call_id] = term
                    await status_queue.put(f'Looking up "{term}"…')
            elif isinstance(event, FunctionToolResultEvent):
                if not isinstance(event.part, ToolReturnPart):
                    continue  # RetryPromptPart: a model-retry, not a real result.
                if event.part.tool_name == "search_transcripts":
                    results = cast(list[ChunkResult], event.part.content)
                    semantic_count = sum(1 for r in results if "semantic" in r.matched_via)
                    fts_count = sum(1 for r in results if "fts" in r.matched_via)
                    if not results:
                        await status_queue.put("No relevant passages found")
                        continue
                    clauses = [
                        clause
                        for clause in (
                            f"{semantic_count} via semantic search" if semantic_count else None,
                            f"{fts_count} via text search" if fts_count else None,
                        )
                        if clause is not None
                    ]
                    await status_queue.put(
                        f"Found {len(results)} relevant passage(s) — {', '.join(clauses)}"
                    )
                elif event.part.tool_name == "lookup_entities":
                    result = cast(EntityLookupResult, event.part.content)
                    term = pending_call_terms.get(event.part.tool_call_id, "")
                    if not result.speakers and not result.videos and not result.folders:
                        await status_queue.put(f'No matches found for "{term}"')
                        continue
                    clauses = [
                        clause
                        for clause in (
                            f"{len(result.speakers)} speaker(s)" if result.speakers else None,
                            f"{len(result.videos)} video(s)" if result.videos else None,
                            f"{len(result.folders)} folder(s)" if result.folders else None,
                        )
                        if clause is not None
                    ]
                    await status_queue.put(f'Found {", ".join(clauses)} matching "{term}"')

    async def run_agent() -> Any:
        try:
            return await transcript_agent.run(
                question,
                deps=deps,
                message_history=message_history,
                event_stream_handler=on_events,
                # Backstop against a runaway search loop (see
                # MAX_SEARCH_TOOL_CALLS' docstring) — independent of whether
                # the system prompt is followed.
                usage_limits=UsageLimits(tool_calls_limit=MAX_SEARCH_TOOL_CALLS),
            )
        finally:
            # Unblocks the status-relay loop below once the run (successful
            # or not) has stopped producing tool-call events.
            await status_queue.put(None)

    run_task = asyncio.ensure_future(run_agent())
    while True:
        status = await status_queue.get()
        if status is None:
            break
        yield {"type": "status", "message": status}

    try:
        result = await run_task
    except UsageLimitExceeded:
        # No `result` exists to pull an answer/history from — degrade to a
        # plain apology rather than a 500. The failed attempt's tool calls
        # aren't persisted to agent_message_history, so the next turn simply
        # resumes from before this one, as if it hadn't happened.
        logger.warning(
            "chat.ask conversation_id=%s hit the %d-search-tool-call limit "
            "without producing an answer",
            conversation.id,
            MAX_SEARCH_TOOL_CALLS,
        )
        answer_text = (
            "I searched several times but couldn't settle on a confident answer. "
            "Try asking a more specific question."
        )
        resolved_citations: list[dict[str, Any]] = []
    except Exception:
        logger.exception("chat.ask conversation_id=%s failed", conversation.id)
        yield {"type": "error", "message": "Something went wrong answering your question."}
        return
    else:
        # Hallucination guard: only citations naming a chunk_id a tool call
        # actually returned this run survive.
        guarded_citations = [
            citation
            for citation in result.output.citations
            if citation.chunk_id in deps.seen_chunk_ids
        ]
        dropped = len(result.output.citations) - len(guarded_citations)
        if dropped:
            logger.warning(
                "chat.ask conversation_id=%s dropped %d hallucinated citation(s) "
                "not backed by any tool call",
                conversation.id,
                dropped,
            )
        resolved_citations = [
            resolved
            for citation in guarded_citations
            if (resolved := _resolve_citation(session, citation)) is not None
        ]
        answer_text = result.output.answer
        conversation.agent_message_history = {
            "messages": ModelMessagesTypeAdapter.dump_python(result.all_messages(), mode="json")
        }

    logger.info(
        "chat.ask conversation_id=%s answered with %d citation(s), %d chunk(s) seen across "
        "all tool calls this turn",
        conversation.id,
        len(resolved_citations),
        len(deps.seen_chunk_ids),
    )

    session.add(
        ChatMessage(
            conversation_id=conversation.id,
            project_id=project_id,
            role="user",
            content=question,
            citations=None,
            created_by=user_id,
        )
    )
    assistant_message = ChatMessage(
        conversation_id=conversation.id,
        project_id=project_id,
        role="assistant",
        content=answer_text,
        citations=resolved_citations,
        created_by=user_id,
    )
    session.add(assistant_message)
    conversation.updated_by = user_id

    session.flush()
    yield {
        "type": "done",
        "conversation_id": conversation.id,
        "assistant_message": assistant_message,
    }


def answer_question(
    session: Session,
    project_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    question: str,
    *,
    user_id: uuid.UUID,
) -> ChatMessage:
    """Synchronous convenience wrapper over ``stream_answer_question``.

    Discards progress events and returns just the final message — for
    callers that don't need live status (tests, scripts, non-HTTP callers).
    """

    async def _run() -> ChatMessage:
        async for event in stream_answer_question(
            session, project_id, conversation_id, question, user_id=user_id
        ):
            if event["type"] == "done":
                return event["assistant_message"]  # type: ignore[no-any-return]
            if event["type"] == "error":
                raise RuntimeError(event["message"])
        raise RuntimeError("stream_answer_question ended without a result")

    return asyncio.run(_run())
