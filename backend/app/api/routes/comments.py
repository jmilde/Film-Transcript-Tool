from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_comment_access, require_transcript_access
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.comment import Comment, CommentRange, CommentReply
from app.models.transcript import Transcript, TranscriptToken
from app.models.user import User
from app.schemas.comment import (
    CommentCreate,
    CommentRead,
    CommentReplyCreate,
    CommentReplyRead,
    CommentUpdate,
)
from app.services.comments import add_reply, create_comment, set_resolved

router = APIRouter(tags=["comments"])


def _comment_read(db: Session, comment: Comment) -> CommentRead:
    range_ = db.execute(
        select(CommentRange).where(CommentRange.comment_id == comment.id)
    ).scalar_one()
    start_token = db.get(TranscriptToken, range_.start_token_id)
    end_token = db.get(TranscriptToken, range_.end_token_id)
    assert start_token is not None and end_token is not None
    replies = list(
        db.execute(
            select(CommentReply)
            .where(CommentReply.comment_id == comment.id)
            .order_by(CommentReply.created_at)
        )
        .scalars()
        .all()
    )
    return CommentRead(
        id=comment.id,
        transcript_id=comment.transcript_id,
        created_by=comment.created_by,
        text=comment.text,
        resolved=comment.resolved,
        start_token_id=range_.start_token_id,
        end_token_id=range_.end_token_id,
        in_time=start_token.start_time,
        out_time=end_token.end_time,
        created_at=comment.created_at,
        replies=[
            CommentReplyRead(
                id=reply.id,
                created_by=reply.created_by,
                text=reply.text,
                created_at=reply.created_at,
            )
            for reply in replies
        ],
    )


@router.post("/transcripts/{transcript_id}/comments", response_model=CommentRead)
def create(
    payload: CommentCreate,
    transcript: Transcript = Depends(require_transcript_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CommentRead:
    comment = create_comment(
        db,
        transcript,
        start_token_id=payload.start_token_id,
        end_token_id=payload.end_token_id,
        text=payload.text,
        user_id=user.id,
    )
    db.commit()
    db.refresh(comment)
    return _comment_read(db, comment)


@router.get("/transcripts/{transcript_id}/comments", response_model=list[CommentRead])
def list_comments(
    transcript: Transcript = Depends(require_transcript_access),
    db: Session = Depends(get_db),
) -> list[CommentRead]:
    comments = list(
        db.execute(
            select(Comment)
            .where(Comment.transcript_id == transcript.id)
            .order_by(Comment.created_at)
        )
        .scalars()
        .all()
    )
    return [_comment_read(db, comment) for comment in comments]


@router.post("/comments/{comment_id}/replies", response_model=CommentRead)
def reply(
    payload: CommentReplyCreate,
    comment: Comment = Depends(require_comment_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CommentRead:
    add_reply(db, comment, payload.text, user_id=user.id)
    db.commit()
    db.refresh(comment)
    return _comment_read(db, comment)


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def update(
    payload: CommentUpdate,
    comment: Comment = Depends(require_comment_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CommentRead:
    if "resolved" in payload.model_fields_set and payload.resolved is not None:
        set_resolved(db, comment, payload.resolved, user_id=user.id)
        db.commit()
        db.refresh(comment)
    return _comment_read(db, comment)
