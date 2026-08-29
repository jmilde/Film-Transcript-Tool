import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.comment import Comment, CommentRange, CommentReply, DocumentCommentAnchor
from app.models.document import Document
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


def create_document_comment(
    session: Session,
    document: Document,
    *,
    clip_node_id: str | None,
    text: str,
    user_id: uuid.UUID,
) -> Comment:
    """Create a comment anchored to ``document``.

    Mirrors ``create_comment``'s shape for the document side of the polymorphic
    anchor. Never touches ``document.content`` — a prose-text comment's actual
    position anchor is a TipTap `comment` mark the frontend applies to the
    editor separately (see `docs/1100_document_builder.md`); a clip-node
    comment's anchor is `clip_node_id` alone, since a clip node is immutable
    read-only content that never needs an in-editor mark of its own.
    """
    comment = Comment(
        document_id=document.id,
        project_id=document.project_id,
        text=text,
        resolved=False,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(comment)
    session.flush()
    session.add(DocumentCommentAnchor(comment_id=comment.id, clip_node_id=clip_node_id))
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
