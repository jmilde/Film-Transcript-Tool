"""Orchestrates one chat turn: run the agent, guard citations, persist messages."""

import logging
import uuid
from typing import Any

from pydantic_ai import ModelMessagesTypeAdapter
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.usage import UsageLimits
from sqlalchemy.orm import Session

from app.agents.transcript_search import (
    MAX_SEARCH_TOOL_CALLS,
    ChatDeps,
    Citation,
    transcript_agent,
)
from app.core.errors import NotFoundError
from app.models.chat import ChatConversation, ChatMessage
from app.models.embedding import TranscriptChunk
from app.models.video import Video

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


def answer_question(
    session: Session,
    project_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    question: str,
    *,
    user_id: uuid.UUID,
) -> ChatMessage:
    """Run one chat turn and persist it, creating the conversation if needed.

    Multi-turn continuity comes from ``ChatConversation.agent_message_history``
    (PydanticAI's own serialized message list), fed back into the agent as
    ``message_history`` so it remembers what it already searched.
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
    try:
        result = transcript_agent.run_sync(
            question,
            deps=deps,
            message_history=message_history,
            # Backstop against a runaway search loop (see MAX_SEARCH_TOOL_CALLS'
            # docstring) — independent of whether the system prompt is followed.
            usage_limits=UsageLimits(tool_calls_limit=MAX_SEARCH_TOOL_CALLS),
        )
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
    return assistant_message
