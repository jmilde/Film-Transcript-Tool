import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_member
from app.core.auth import get_current_user
from app.core.errors import NotFoundError
from app.core.media_token import mint_media_token
from app.db.session import get_db
from app.models.asset import AssetType, VideoAsset
from app.models.chat import ChatConversation, ChatMessage
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.schemas.chat import (
    ChatAskRequest,
    ChatCitation,
    ChatConversationSummary,
    ChatMessageRead,
)
from app.services.chat import stream_answer_question
from app.services.folders import build_folder_breadcrumbs

router = APIRouter(tags=["chat"])


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _enrich_citations(db: Session, citations: list[dict[str, Any]] | None) -> list[ChatCitation]:
    """Attach a thumbnail token and folder breadcrumb to each stored citation.

    Computed fresh on every read, like ``search.py``'s ``SearchVideoGroup`` —
    a media token is short-lived and a breadcrumb can go stale, so neither is
    persisted on ``ChatMessage.citations``.
    """
    if not citations:
        return []

    video_ids = {uuid.UUID(citation["video_id"]) for citation in citations}
    videos = {
        video.id: video
        for video in db.execute(select(Video).where(Video.id.in_(video_ids))).scalars()
    }
    thumbnail_video_ids = set(
        db.execute(
            select(VideoAsset.video_id).where(
                VideoAsset.video_id.in_(video_ids), VideoAsset.type == AssetType.THUMBNAIL
            )
        ).scalars()
    )
    breadcrumbs = build_folder_breadcrumbs(db, (video.folder_id for video in videos.values()))

    enriched: list[ChatCitation] = []
    for citation in citations:
        video_id = uuid.UUID(citation["video_id"])
        video = videos.get(video_id)
        has_thumbnail = video_id in thumbnail_video_ids
        enriched.append(
            ChatCitation(
                **citation,
                thumbnail_token=mint_media_token(video_id) if has_thumbnail else None,
                folder_path=breadcrumbs.get(video.folder_id, []) if video is not None else [],
            )
        )
    return enriched


def _to_message_read(db: Session, message: ChatMessage) -> ChatMessageRead:
    citations = message.citations
    return ChatMessageRead(
        id=message.id,
        role=message.role,
        content=message.content,
        citations=_enrich_citations(db, citations) if citations is not None else None,
        created_at=message.created_at,
    )


@router.post("/projects/{project_id}/chat")
def ask(
    payload: ChatAskRequest,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Ask a question over the project's transcripts; enqueues no job.

    Streams server-sent events on the same request/response rather than a
    single JSON body: a ``status`` event each time the agent starts a search
    (so the UI can show "Searching for ..." live), then one terminal event —
    ``done`` with the persisted message, or ``error``.

    A bad ``conversation_id`` is checked here, before the stream starts, so
    it can still be a normal 404 — once ``StreamingResponse`` sends headers
    (200), the status code can no longer change, so ``stream_answer_question``
    turns that same case into an ``error`` event instead as a defensive
    fallback (e.g. a delete racing this request).
    """
    if payload.conversation_id is not None:
        conversation = db.get(ChatConversation, payload.conversation_id)
        if conversation is None or conversation.project_id != project.id:
            raise NotFoundError("Conversation not found")

    async def event_source() -> AsyncIterator[str]:
        async for event in stream_answer_question(
            db, project.id, payload.conversation_id, payload.question, user_id=user.id
        ):
            if event["type"] == "status":
                yield _sse({"type": "status", "message": event["message"]})
            elif event["type"] == "error":
                db.rollback()
                yield _sse({"type": "error", "message": event["message"]})
            elif event["type"] == "done":
                db.commit()
                message = event["assistant_message"]
                yield _sse(
                    {
                        "type": "done",
                        "conversation_id": str(event["conversation_id"]),
                        "message": _to_message_read(db, message).model_dump(mode="json"),
                    }
                )

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/projects/{project_id}/chat", response_model=list[ChatConversationSummary])
def list_conversations(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[ChatConversationSummary]:
    """A project's chat history, most recently active conversation first."""
    conversations = db.execute(
        select(ChatConversation)
        .where(ChatConversation.project_id == project.id)
        .order_by(ChatConversation.updated_at.desc())
    ).scalars()
    return [ChatConversationSummary.model_validate(c) for c in conversations]


@router.get("/projects/{project_id}/chat/{conversation_id}", response_model=list[ChatMessageRead])
def get_conversation(
    conversation_id: uuid.UUID,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[ChatMessageRead]:
    conversation = db.get(ChatConversation, conversation_id)
    if conversation is None or conversation.project_id != project.id:
        raise NotFoundError("Conversation not found")
    messages = db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at)
    ).scalars()
    return [_to_message_read(db, message) for message in messages]
