from typing import Any

import pytest
from app.models.comment import CommentRange, CommentReply, DocumentCommentAnchor
from app.models.document import Document
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.comments import (
    CommentRangeInvalidError,
    add_reply,
    create_comment,
    create_document_comment,
    set_resolved,
)
from app.services.documents import resolve_document_comment_excerpt
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    return project


def _transcript(db: Session, project: Project, user: User, name: str) -> Transcript:
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name=name,
        original_filename=f"{name}.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    raw = load_deepgram_sample()
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    return transcript


def _tokens(db: Session, transcript: Transcript, segment_index: int) -> list[TranscriptToken]:
    segments = (
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    return list(
        db.execute(
            select(TranscriptToken)
            .where(TranscriptToken.segment_id == segments[segment_index].id)
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .all()
    )


def test_create_comment_builds_range(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript, 0)  # Hello / there.

    comment = create_comment(
        db_session,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Check this",
        user_id=user.id,
    )

    assert comment.resolved is False
    assert comment.project_id == transcript.project_id
    range_ = db_session.execute(
        select(CommentRange).where(CommentRange.comment_id == comment.id)
    ).scalar_one()
    assert range_.start_token_id == tokens[0].id
    assert range_.end_token_id == tokens[1].id


def test_create_comment_cross_transcript_rejected(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript_a = _transcript(db_session, project, user, "a")
    transcript_b = _transcript(db_session, project, user, "b")
    start = _tokens(db_session, transcript_a, 0)[0]
    end = _tokens(db_session, transcript_b, 0)[0]

    with pytest.raises(CommentRangeInvalidError):
        create_comment(
            db_session,
            transcript_a,
            start_token_id=start.id,
            end_token_id=end.id,
            text="straddles",
            user_id=user.id,
        )


def test_add_reply(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript, 0)
    comment = create_comment(
        db_session,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Check this",
        user_id=user.id,
    )

    reply = add_reply(db_session, comment, "Agreed", user_id=user.id)

    stored = db_session.get(CommentReply, reply.id)
    assert stored is not None
    assert stored.text == "Agreed"
    assert stored.comment_id == comment.id


def _document(
    db: Session, project: Project, user: User, content: dict[str, Any] | None = None
) -> Document:
    document = Document(
        project_id=project.id,
        title="Draft",
        content=content or {"type": "doc", "content": []},
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(document)
    db.flush()
    return document


def test_create_document_comment_clip_node(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    document = _document(db_session, project, user)

    comment = create_document_comment(
        db_session, document, clip_node_id="node-1", text="Nice moment", user_id=user.id
    )

    assert comment.document_id == document.id
    assert comment.transcript_id is None
    anchor = db_session.execute(
        select(DocumentCommentAnchor).where(DocumentCommentAnchor.comment_id == comment.id)
    ).scalar_one()
    assert anchor.clip_node_id == "node-1"


def test_create_document_comment_prose_has_no_clip_node(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    document = _document(db_session, project, user)

    comment = create_document_comment(
        db_session, document, clip_node_id=None, text="Rephrase this", user_id=user.id
    )

    anchor = db_session.execute(
        select(DocumentCommentAnchor).where(DocumentCommentAnchor.comment_id == comment.id)
    ).scalar_one()
    assert anchor.clip_node_id is None


def test_resolve_document_comment_excerpt_clip_node(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript, 0)  # Hello / there.
    content = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "clipBlock",
                        "attrs": {
                            "nodeId": "node-1",
                            "transcriptId": str(transcript.id),
                            "startTokenId": str(tokens[0].id),
                            "endTokenId": str(tokens[1].id),
                        },
                    }
                ],
            }
        ],
    }
    document = _document(db_session, project, user, content)
    comment = create_document_comment(
        db_session, document, clip_node_id="node-1", text="Nice moment", user_id=user.id
    )

    excerpt = resolve_document_comment_excerpt(
        db_session, document, comment_id=comment.id, clip_node_id="node-1"
    )

    assert excerpt == "Hello there."


def test_resolve_document_comment_excerpt_missing_clip_node_returns_none(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    document = _document(db_session, project, user)
    comment = create_document_comment(
        db_session, document, clip_node_id="node-missing", text="orphaned", user_id=user.id
    )

    excerpt = resolve_document_comment_excerpt(
        db_session, document, comment_id=comment.id, clip_node_id="node-missing"
    )

    assert excerpt is None


def test_resolve_document_comment_excerpt_prose_mark(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    document = _document(db_session, project, user)
    comment = create_document_comment(
        db_session, document, clip_node_id=None, text="Rephrase this", user_id=user.id
    )
    document.content = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Some "},
                    {
                        "type": "text",
                        "text": "marked words",
                        "marks": [{"type": "comment", "attrs": {"commentId": str(comment.id)}}],
                    },
                    {"type": "text", "text": " after"},
                ],
            }
        ],
    }
    db_session.flush()

    excerpt = resolve_document_comment_excerpt(
        db_session, document, comment_id=comment.id, clip_node_id=None
    )

    assert excerpt == "marked words"


def test_set_resolved(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript, 0)
    comment = create_comment(
        db_session,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Check this",
        user_id=user.id,
    )

    set_resolved(db_session, comment, True, user_id=user.id)

    assert comment.resolved is True
