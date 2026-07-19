import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.comment import Comment, CommentRange, CommentReply
from app.models.transcript import Transcript, TranscriptToken


class CommentRangeInvalidError(BadRequestError):
    """Raised when a comment's start/end tokens don't both belong to the transcript."""

    code = "COMMENT_RANGE_INVALID"


def create_comment(
    session: Session,
    transcript: Transcript,
    *,
    start_token_id: uuid.UUID,
    end_token_id: uuid.UUID,
    text: str,
    user_id: uuid.UUID,
) -> Comment:
    """Create a comment anchored to a token range on ``transcript``.

    Both tokens must exist and belong to this transcript; anchoring a comment to
    tokens from another transcript is rejected so a range can never straddle
    transcripts.
    """
    tokens = {
        token.id: token
        for token in session.execute(
            select(TranscriptToken).where(TranscriptToken.id.in_({start_token_id, end_token_id}))
        )
        .scalars()
        .all()
    }
    for token_id in (start_token_id, end_token_id):
        token = tokens.get(token_id)
        if token is None:
            raise NotFoundError("Token not found")
        if token.transcript_id != transcript.id:
            raise CommentRangeInvalidError("Token does not belong to this transcript")

    comment = Comment(
        transcript_id=transcript.id,
        project_id=transcript.project_id,
        text=text,
        resolved=False,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(comment)
    session.flush()
    session.add(
        CommentRange(
            comment_id=comment.id,
            start_token_id=start_token_id,
            end_token_id=end_token_id,
        )
    )
    session.flush()
    return comment


def add_reply(session: Session, comment: Comment, text: str, *, user_id: uuid.UUID) -> CommentReply:
    reply = CommentReply(comment_id=comment.id, text=text, created_by=user_id)
    session.add(reply)
    session.flush()
    return reply


def set_resolved(
    session: Session, comment: Comment, resolved: bool, *, user_id: uuid.UUID
) -> Comment:
    comment.resolved = resolved
    comment.updated_by = user_id
    session.flush()
    return comment
