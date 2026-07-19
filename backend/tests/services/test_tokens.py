from decimal import Decimal

import pytest
from app.core.errors import BadRequestError
from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.tokens import (
    TokenMergeInvalidSegmentError,
    delete_token,
    edit_token,
    merge_tokens,
    split_token,
)
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed(db: Session, user: User) -> Transcript:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
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


def _segment_tokens(
    db: Session, transcript: Transcript, segment_index: int
) -> list[TranscriptToken]:
    segments = (
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    segment = segments[segment_index]
    return list(
        db.execute(
            select(TranscriptToken)
            .where(
                TranscriptToken.segment_id == segment.id,
                TranscriptToken.is_deleted.is_(False),
            )
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .all()
    )


def test_edit_token_only_changes_text(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]
    original_start, original_end = token.start_time, token.end_time
    original_text = token.original_text

    edit_token(db_session, token, "Hi", user_id=user.id)

    assert token.edited_text == "Hi"
    # Original transcription and timing are untouched (non-destructive).
    assert token.original_text == original_text
    assert token.start_time == original_start
    assert token.end_time == original_end
    assert token.is_deleted is False
    assert token.updated_by == user.id


def test_edit_token_can_clear_edit(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]
    edit_token(db_session, token, "Hi", user_id=user.id)

    edit_token(db_session, token, None, user_id=user.id)

    assert token.edited_text is None


def test_delete_token_is_soft(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]
    token_id = token.id

    delete_token(db_session, token, user_id=user.id)

    # Marked deleted but still physically present in the table.
    persisted = db_session.get(TranscriptToken, token_id)
    assert persisted is not None
    assert persisted.is_deleted is True
    assert persisted.updated_by == user.id


def test_merge_tokens_same_segment(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)  # How / are / you?
    first, second = tokens[0], tokens[1]

    merged = merge_tokens(db_session, [first, second], "How are", user_id=user.id)

    # Replacement spans the timing of the merged range.
    assert merged.start_time == first.start_time
    assert merged.end_time == second.end_time
    assert merged.original_text == "How are"
    assert merged.edited_text is None
    assert merged.segment_id == first.segment_id
    assert merged.is_deleted is False
    assert merged.created_by == user.id
    # Originals are soft-deleted, not removed.
    assert first.is_deleted is True
    assert second.is_deleted is True
    # Order stays stable: the merged token takes the first token's slot.
    remaining = _segment_tokens(db_session, transcript, 1)
    assert [t.original_text for t in remaining] == ["How are", "you?"]


def test_merge_tokens_across_segments_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    seg0 = _segment_tokens(db_session, transcript, 0)[-1]  # "there."
    seg1 = _segment_tokens(db_session, transcript, 1)[0]  # "How"

    with pytest.raises(TokenMergeInvalidSegmentError):
        merge_tokens(db_session, [seg0, seg1], "there. How", user_id=user.id)

    # Nothing was mutated on a rejected merge.
    assert seg0.is_deleted is False
    assert seg1.is_deleted is False


def test_merge_tokens_requires_at_least_two(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[0]

    with pytest.raises(BadRequestError):
        merge_tokens(db_session, [token], "How", user_id=user.id)


def test_split_token_interpolates_timestamps(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]  # "you?" 1.6 - 1.9
    assert (token.start_time, token.end_time) == (1.6, 1.9)

    parts = split_token(db_session, token, ["you", "?"], user_id=user.id)

    assert [p.original_text for p in parts] == ["you", "?"]
    # Even interpolation across the original [1.6, 1.9] range.
    assert parts[0].start_time == pytest.approx(1.6)
    assert parts[0].end_time == pytest.approx(1.75)
    assert parts[1].start_time == pytest.approx(1.75)
    assert parts[1].end_time == pytest.approx(1.9)
    assert all(p.segment_id == token.segment_id for p in parts)
    assert all(p.edited_text is None for p in parts)
    # Original is soft-deleted, replacements ordered after their neighbours.
    assert token.is_deleted is True
    remaining = _segment_tokens(db_session, transcript, 1)
    assert [t.original_text for t in remaining] == ["How", "are", "you", "?"]


def test_split_token_requires_at_least_two(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]

    with pytest.raises(BadRequestError):
        split_token(db_session, token, ["you?"], user_id=user.id)


def test_split_positions_stay_between_neighbours(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)
    middle = tokens[1]  # "are", between "How" and "you?"
    prev_pos, next_pos = tokens[0].position, tokens[2].position

    parts = split_token(db_session, middle, ["a", "re"], user_id=user.id)

    assert all(isinstance(p.position, Decimal) for p in parts)
    assert all(prev_pos < p.position < next_pos for p in parts)
    assert parts[0].position < parts[1].position
