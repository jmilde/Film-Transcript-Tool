import uuid
from typing import Any

from fastapi import APIRouter, Depends
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
    ChatAskResponse,
    ChatCitation,
    ChatConversationSummary,
    ChatMessageRead,
)
from app.services.chat import answer_question
from app.services.folders import build_folder_breadcrumbs

router = APIRouter(tags=["chat"])


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


@router.post("/projects/{project_id}/chat", response_model=ChatAskResponse)
def ask(
    payload: ChatAskRequest,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatAskResponse:
    """Ask a question over the project's transcripts; enqueues no job — synchronous."""
    message = answer_question(
        db, project.id, payload.conversation_id, payload.question, user_id=user.id
    )
    db.commit()
    return ChatAskResponse(
        conversation_id=message.conversation_id, message=_to_message_read(db, message)
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
