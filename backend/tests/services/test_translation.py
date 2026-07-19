import pytest
from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.services.translation import (
    collect_source_segments,
    create_translation_transcript,
    interpolate_token_times,
)
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _source_transcript(db: Session, user: User) -> Transcript:
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
    raw = load_deepgram_sample()  # 2 segments: [Hello there.] 0.0-0.8 / [How are you?] 1.2-1.9
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    return transcript


def _tokens_in_order(db: Session, transcript_id: object) -> list[TranscriptToken]:
    return list(
        db.execute(
            select(TranscriptToken)
            .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
            .where(TranscriptToken.transcript_id == transcript_id)
            .order_by(TranscriptSegment.position, TranscriptToken.position)
        )
        .scalars()
        .all()
    )


def test_interpolate_token_times_even() -> None:
    assert interpolate_token_times(2, 10.0, 20.0) == [(10.0, 15.0), (15.0, 20.0)]


def test_interpolate_token_times_single_spans_whole_range() -> None:
    assert interpolate_token_times(1, 10.0, 20.0) == [(10.0, 20.0)]


def test_interpolate_token_times_zero_count() -> None:
    assert interpolate_token_times(0, 10.0, 20.0) == []


def test_interpolate_token_times_zero_span() -> None:
    # A zero-length source range yields degenerate intervals, never negative ones.
    assert interpolate_token_times(2, 5.0, 5.0) == [(5.0, 5.0), (5.0, 5.0)]


def test_collect_source_segments_uses_displayed_text_and_time_range(
    db_session: Session, user: User
) -> None:
    transcript = _source_transcript(db_session, user)

    sources = collect_source_segments(db_session, transcript)

    assert [s.text for s in sources] == ["Hello there.", "How are you?"]
    assert sources[0].start_time == pytest.approx(0.0)
    assert sources[0].end_time == pytest.approx(0.8)
    assert sources[1].start_time == pytest.approx(1.2)
    assert sources[1].end_time == pytest.approx(1.9)
    # Each source segment carries the source speaker so the translation reuses it.
    assert sources[0].speaker_id is not None
    assert sources[0].speaker_id != sources[1].speaker_id


def test_collect_source_segments_edited_text_wins_and_deleted_excluded(
    db_session: Session, user: User
) -> None:
    transcript = _source_transcript(db_session, user)
    tokens = _tokens_in_order(db_session, transcript.id)
    tokens[0].edited_text = "Goodbye"  # "Hello" -> "Goodbye"
    tokens[3].is_deleted = True  # drop "are" from the second segment [How, are, you?]
    db_session.flush()

    sources = collect_source_segments(db_session, transcript)

    assert sources[0].text == "Goodbye there."
    assert sources[1].text == "How you?"


def test_create_translation_transcript_builds_independent_translation(
    db_session: Session, user: User
) -> None:
    source = _source_transcript(db_session, user)
    sources = collect_source_segments(db_session, source)

    translation = create_translation_transcript(
        db_session,
        source,
        sources,
        ["Hola mundo", "Uno dos tres"],
        target_language="es",
        created_by=user.id,
    )
    db_session.flush()

    assert translation.id != source.id
    assert translation.type is TranscriptType.TRANSLATION
    assert translation.language == "es"
    assert translation.video_id == source.video_id
    assert translation.project_id == source.project_id
    # Translations never keep the provider raw payload (only originals do).
    assert translation.provider_raw_response is None

    tokens = _tokens_in_order(db_session, translation.id)
    assert [t.original_text for t in tokens] == ["Hola", "mundo", "Uno", "dos", "tres"]
    assert all(t.edited_text is None for t in tokens)

    # First segment's two words split [0.0, 0.8] evenly.
    assert tokens[0].start_time == pytest.approx(0.0)
    assert tokens[0].end_time == pytest.approx(0.4)
    assert tokens[1].start_time == pytest.approx(0.4)
    assert tokens[1].end_time == pytest.approx(0.8)
    # Second segment's three words split [1.2, 1.9] evenly.
    assert tokens[2].start_time == pytest.approx(1.2)
    assert tokens[4].end_time == pytest.approx(1.9)


def test_create_translation_reuses_source_speakers(db_session: Session, user: User) -> None:
    source = _source_transcript(db_session, user)
    sources = collect_source_segments(db_session, source)

    translation = create_translation_transcript(
        db_session, source, sources, ["Hola", "Adios"], target_language="es", created_by=user.id
    )
    db_session.flush()

    translated_segments = list(
        db_session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == translation.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    assert [seg.speaker_id for seg in translated_segments] == [s.speaker_id for s in sources]


def test_create_translation_does_not_mutate_source(db_session: Session, user: User) -> None:
    source = _source_transcript(db_session, user)
    before = [(t.original_text, t.edited_text) for t in _tokens_in_order(db_session, source.id)]
    sources = collect_source_segments(db_session, source)

    create_translation_transcript(
        db_session, source, sources, ["Hola mundo", "x"], target_language="es", created_by=user.id
    )
    db_session.flush()

    after = [(t.original_text, t.edited_text) for t in _tokens_in_order(db_session, source.id)]
    assert after == before
    assert source.language == "en"


def test_create_translation_skips_empty_translation_segment(
    db_session: Session, user: User
) -> None:
    source = _source_transcript(db_session, user)
    sources = collect_source_segments(db_session, source)

    translation = create_translation_transcript(
        db_session, source, sources, ["", "Uno dos"], target_language="es", created_by=user.id
    )
    db_session.flush()

    # An empty translation contributes no segment/tokens.
    tokens = _tokens_in_order(db_session, translation.id)
    assert [t.original_text for t in tokens] == ["Uno", "dos"]
