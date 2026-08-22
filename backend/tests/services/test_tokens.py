import threading
import time
import uuid
from collections.abc import Iterator
from decimal import Decimal

import pytest
from app.config import get_settings
from app.core.errors import BadRequestError, ConflictError
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import (
    Transcript,
    TranscriptSegment,
    TranscriptToken,
    TranscriptType,
)
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
from sqlalchemy import Engine, create_engine, delete, select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed(db: Session, user: User) -> Transcript:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
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

    edit_token(db_session, token, "Hi", user_id=user.id, expected_version=1)

    assert token.edited_text == "Hi"
    # Original transcription and timing are untouched (non-destructive).
    assert token.original_text == original_text
    assert token.start_time == original_start
    assert token.end_time == original_end
    assert token.is_deleted is False
    assert token.updated_by == user.id
    # Version bumped so the next writer must supply the new value.
    assert token.version == 2


def test_edit_token_can_clear_edit(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]
    edit_token(db_session, token, "Hi", user_id=user.id, expected_version=1)

    edit_token(db_session, token, None, user_id=user.id, expected_version=2)

    assert token.edited_text is None


def test_edit_token_stale_version_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]

    with pytest.raises(ConflictError) as excinfo:
        edit_token(db_session, token, "Hi", user_id=user.id, expected_version=99)

    assert excinfo.value.details is not None
    assert excinfo.value.details["current_tokens"] == [
        {
            "id": str(token.id),
            "version": 1,
            "original_text": token.original_text,
            "edited_text": None,
            "is_deleted": False,
            "start_time": token.start_time,
            "end_time": token.end_time,
        }
    ]
    # Nothing was mutated on a rejected write.
    assert token.edited_text is None
    assert token.version == 1


def test_delete_token_is_soft(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]
    token_id = token.id

    delete_token(db_session, token, user_id=user.id, expected_version=1)

    # Marked deleted but still physically present in the table.
    persisted = db_session.get(TranscriptToken, token_id)
    assert persisted is not None
    assert persisted.is_deleted is True
    assert persisted.updated_by == user.id
    assert persisted.version == 2


def test_delete_token_stale_version_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]

    with pytest.raises(ConflictError):
        delete_token(db_session, token, user_id=user.id, expected_version=99)

    assert token.is_deleted is False


def test_merge_tokens_same_segment(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)  # How / are / you?
    first, second = tokens[0], tokens[1]

    merged = merge_tokens(
        db_session,
        [first, second],
        "How are",
        user_id=user.id,
        expected_versions={first.id: 1, second.id: 1},
    )

    # Replacement spans the timing of the merged range.
    assert merged.start_time == first.start_time
    assert merged.end_time == second.end_time
    assert merged.original_text == "How are"
    assert merged.edited_text is None
    assert merged.segment_id == first.segment_id
    assert merged.is_deleted is False
    assert merged.created_by == user.id
    assert merged.version == 1
    # Originals are soft-deleted, not removed.
    assert first.is_deleted is True
    assert second.is_deleted is True
    assert first.version == 2
    assert second.version == 2
    # Order stays stable: the merged token takes the first token's slot.
    remaining = _segment_tokens(db_session, transcript, 1)
    assert [t.original_text for t in remaining] == ["How are", "you?"]


def test_merge_tokens_stale_version_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)
    first, second = tokens[0], tokens[1]

    with pytest.raises(ConflictError):
        merge_tokens(
            db_session,
            [first, second],
            "How are",
            user_id=user.id,
            expected_versions={first.id: 1, second.id: 99},
        )

    assert first.is_deleted is False
    assert second.is_deleted is False


def test_merge_tokens_across_segments_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    seg0 = _segment_tokens(db_session, transcript, 0)[-1]  # "there."
    seg1 = _segment_tokens(db_session, transcript, 1)[0]  # "How"

    with pytest.raises(TokenMergeInvalidSegmentError):
        merge_tokens(
            db_session,
            [seg0, seg1],
            "there. How",
            user_id=user.id,
            expected_versions={seg0.id: 1, seg1.id: 1},
        )

    # Nothing was mutated on a rejected merge.
    assert seg0.is_deleted is False
    assert seg1.is_deleted is False


def test_merge_tokens_requires_at_least_two(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[0]

    with pytest.raises(BadRequestError):
        merge_tokens(db_session, [token], "How", user_id=user.id, expected_versions={token.id: 1})


def test_split_token_interpolates_timestamps(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]  # "you?" 1.6 - 1.9
    assert (token.start_time, token.end_time) == (1.6, 1.9)

    parts = split_token(db_session, token, ["you", "?"], user_id=user.id, expected_version=1)

    assert [p.original_text for p in parts] == ["you", "?"]
    # Even interpolation across the original [1.6, 1.9] range.
    assert parts[0].start_time == pytest.approx(1.6)
    assert parts[0].end_time == pytest.approx(1.75)
    assert parts[1].start_time == pytest.approx(1.75)
    assert parts[1].end_time == pytest.approx(1.9)
    assert all(p.segment_id == token.segment_id for p in parts)
    assert all(p.edited_text is None for p in parts)
    assert all(p.version == 1 for p in parts)
    # Original is soft-deleted, replacements ordered after their neighbours.
    assert token.is_deleted is True
    assert token.version == 2
    remaining = _segment_tokens(db_session, transcript, 1)
    assert [t.original_text for t in remaining] == ["How", "are", "you", "?"]


def test_split_token_stale_version_rejected(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]

    with pytest.raises(ConflictError):
        split_token(db_session, token, ["you", "?"], user_id=user.id, expected_version=99)

    assert token.is_deleted is False


def test_split_token_requires_at_least_two(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]

    with pytest.raises(BadRequestError):
        split_token(db_session, token, ["you?"], user_id=user.id, expected_version=1)


def test_split_positions_stay_between_neighbours(db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)
    middle = tokens[1]  # "are", between "How" and "you?"
    prev_pos, next_pos = tokens[0].position, tokens[2].position

    parts = split_token(db_session, middle, ["a", "re"], user_id=user.id, expected_version=1)

    assert all(isinstance(p.position, Decimal) for p in parts)
    assert all(prev_pos < p.position < next_pos for p in parts)
    assert parts[0].position < parts[1].position


# --- Locking race: two genuinely separate connections, mirroring
# tests/worker/test_claim.py's FOR UPDATE pattern. Unlike that test's SKIP
# LOCKED (which never blocks), plain FOR UPDATE *does* block a second writer,
# so proving serialization needs real thread concurrency rather than two
# sequential calls.


@pytest.fixture
def engine() -> Iterator[Engine]:
    eng = create_engine(get_settings().database_url_worker, pool_pre_ping=True)
    yield eng
    eng.dispose()


@pytest.fixture
def committed_token(engine: Engine) -> Iterator[uuid.UUID]:
    """A real, committed token — cleaned up explicitly (no rollback here).

    The locking race test needs two independent connections to see the same
    row, which the transaction-rollback ``db_session`` fixture cannot provide.
    """
    user_id = uuid.uuid4()
    project_id = uuid.uuid4()
    token_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(User(id=user_id, email=f"{user_id}@example.com"))
        session.flush()
        session.add(Project(id=project_id, name="P", created_by=user_id, updated_by=user_id))
        session.flush()
        session.add(
            ProjectMembership(project_id=project_id, user_id=user_id, role=MembershipRole.OWNER)
        )
        folder = Folder(project_id=project_id, name="F", created_by=user_id, updated_by=user_id)
        session.add(folder)
        session.flush()
        video = Video(
            folder_id=folder.id,
            project_id=project_id,
            name="clip",
            original_filename="clip.mp4",
            created_by=user_id,
            updated_by=user_id,
        )
        session.add(video)
        session.flush()
        transcript = Transcript(
            video_id=video.id,
            project_id=project_id,
            language="en",
            type=TranscriptType.ORIGINAL,
            created_by=user_id,
        )
        session.add(transcript)
        session.flush()
        segment = TranscriptSegment(transcript_id=transcript.id, position=Decimal(1))
        session.add(segment)
        session.flush()
        session.add(
            TranscriptToken(
                id=token_id,
                transcript_id=transcript.id,
                segment_id=segment.id,
                project_id=project_id,
                original_text="Hello",
                start_time=0.0,
                end_time=0.4,
                position=Decimal(1),
                created_by=user_id,
                updated_by=user_id,
            )
        )
        session.commit()
    try:
        yield token_id
    finally:
        with Session(engine) as session:
            session.execute(delete(Project).where(Project.id == project_id))
            session.execute(delete(User).where(User.id == user_id))
            session.commit()


def test_concurrent_edit_serializes_via_row_lock(
    engine: Engine, committed_token: uuid.UUID
) -> None:
    barrier = threading.Barrier(2)
    outcomes: dict[str, str] = {}

    def first() -> None:
        with Session(engine) as session:
            token = session.get(TranscriptToken, committed_token)
            assert token is not None
            # Acquires the row lock (flush sends the UPDATE) but does not yet
            # commit, so the lock is held while `second` tries to acquire it.
            edit_token(session, token, "first", user_id=token.created_by, expected_version=1)
            barrier.wait()
            time.sleep(0.3)
            session.commit()
            outcomes["first"] = "ok"

    def second() -> None:
        with Session(engine) as session:
            barrier.wait()
            token = session.get(TranscriptToken, committed_token)
            assert token is not None
            try:
                # Blocks here until `first` commits and releases the row lock,
                # then re-reads the now-current (version=2) row.
                edit_token(session, token, "second", user_id=token.created_by, expected_version=1)
                session.commit()
                outcomes["second"] = "ok"
            except ConflictError:
                session.rollback()
                outcomes["second"] = "conflict"

    t1 = threading.Thread(target=first)
    t2 = threading.Thread(target=second)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one writer succeeded; the other was serialized behind the row
    # lock and then rejected for a stale version — proving FOR UPDATE actually
    # blocks the second writer rather than letting both race on version=1.
    assert sorted(outcomes.values()) == ["conflict", "ok"]

    with Session(engine) as session:
        final = session.get(TranscriptToken, committed_token)
        assert final is not None
        assert final.version == 2
