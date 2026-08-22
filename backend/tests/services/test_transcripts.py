from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import (
    TranscriptSegment,
    TranscriptToken,
    TranscriptType,
)
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _make_video(db: Session, user: User) -> Video:
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
    return video


def test_creates_transcript_segments_and_tokens(db_session: Session, user: User) -> None:
    video = _make_video(db_session, user)
    raw = load_deepgram_sample()
    normalized = normalize(raw)

    transcript = create_transcript_from_normalized(
        db_session, video, normalized, raw, created_by=user.id
    )
    db_session.flush()

    assert transcript.type is TranscriptType.ORIGINAL
    assert transcript.language == "en"
    assert transcript.video_id == video.id
    assert transcript.project_id == video.project_id
    # Raw provider response is preserved for the original.
    assert transcript.provider_raw_response is not None
    assert transcript.provider_raw_response["results"]["channels"][0]["detected_language"] == "en"

    segments = (
        db_session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    assert len(segments) == 2

    tokens = (
        db_session.execute(
            select(TranscriptToken)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptToken.segment_id, TranscriptToken.position)
        )
        .scalars()
        .all()
    )
    assert len(tokens) == 5
    for token in tokens:
        assert token.edited_text is None
        assert token.is_deleted is False
        assert token.project_id == video.project_id
        assert token.created_by == user.id
    first_segment_tokens = [t for t in tokens if t.segment_id == segments[0].id]
    assert [t.original_text for t in first_segment_tokens] == ["Hello", "there."]
    assert first_segment_tokens[0].start_time == 0.0
    assert first_segment_tokens[1].end_time == 0.8


def test_creates_speakers_from_diarization(db_session: Session, user: User) -> None:
    video = _make_video(db_session, user)
    raw = load_deepgram_sample()

    create_transcript_from_normalized(db_session, video, normalize(raw), raw, created_by=user.id)
    db_session.flush()

    speakers = (
        db_session.execute(
            select(Speaker)
            .where(Speaker.video_id == video.id)
            .order_by(Speaker.provider_identifier)
        )
        .scalars()
        .all()
    )
    assert [s.provider_identifier for s in speakers] == ["speaker_0", "speaker_1"]
    assert all(s.project_id == video.project_id for s in speakers)
    assert all(s.name is None for s in speakers)


def test_reuses_existing_speakers_across_transcripts(db_session: Session, user: User) -> None:
    video = _make_video(db_session, user)
    raw = load_deepgram_sample()

    create_transcript_from_normalized(db_session, video, normalize(raw), raw, created_by=user.id)
    create_transcript_from_normalized(db_session, video, normalize(raw), raw, created_by=user.id)
    db_session.flush()

    speaker_count = len(
        db_session.execute(select(Speaker.id).where(Speaker.video_id == video.id)).scalars().all()
    )
    # Two transcripts, but speakers belong to the video and are reused.
    assert speaker_count == 2


def test_translation_does_not_store_raw_response(db_session: Session, user: User) -> None:
    video = _make_video(db_session, user)
    raw = load_deepgram_sample()

    transcript = create_transcript_from_normalized(
        db_session,
        video,
        normalize(raw),
        raw,
        created_by=user.id,
        type_=TranscriptType.TRANSLATION,
    )
    db_session.flush()

    assert transcript.type is TranscriptType.TRANSLATION
    assert transcript.provider_raw_response is None
