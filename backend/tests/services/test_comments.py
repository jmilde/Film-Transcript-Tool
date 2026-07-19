import pytest
from app.models.comment import CommentRange, CommentReply
from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.comments import (
    CommentRangeInvalidError,
    add_reply,
    create_comment,
    set_resolved,
)
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id))
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
