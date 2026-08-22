from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.exports import build_export_document, export_key
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _transcript(db: Session, user: User) -> Transcript:
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
        name="Interview",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    raw = load_deepgram_sample()  # 2 segments: [Hello there.] / [How are you?]
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    return transcript


def _tokens(db: Session, transcript: Transcript) -> list[TranscriptToken]:
    return list(
        db.execute(
            select(TranscriptToken)
            .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position, TranscriptToken.position)
        )
        .scalars()
        .all()
    )


def test_build_document_uses_video_and_language(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)

    document = build_export_document(db_session, transcript)

    assert document.video_name == "Interview"
    assert document.language == "en"
    assert [segment.text for segment in document.segments] == ["Hello there.", "How are you?"]


def test_build_document_edited_text_wins(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)
    hello = _tokens(db_session, transcript)[0]
    hello.edited_text = "Goodbye"
    db_session.flush()

    document = build_export_document(db_session, transcript)

    # Displayed text is the edit; the untouched neighbour keeps its original.
    assert document.segments[0].text == "Goodbye there."


def test_build_document_excludes_deleted_tokens(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)
    hello = _tokens(db_session, transcript)[0]
    hello.is_deleted = True
    db_session.flush()

    document = build_export_document(db_session, transcript)

    assert document.segments[0].text == "there."


def test_build_document_drops_fully_deleted_segment(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)
    for token in _tokens(db_session, transcript)[:2]:  # the whole first segment
        token.is_deleted = True
    db_session.flush()

    document = build_export_document(db_session, transcript)

    assert [segment.text for segment in document.segments] == ["How are you?"]


def test_build_document_resolves_speaker_name(db_session: Session, user: User) -> None:
    transcript = _transcript(db_session, user)
    speaker = db_session.execute(
        select(Speaker).where(Speaker.provider_identifier == "speaker_0")
    ).scalar_one()
    speaker.name = "John"
    db_session.flush()

    document = build_export_document(db_session, transcript)

    # Renamed speaker shows the name; the un-renamed one falls back to its id.
    assert document.segments[0].speaker == "John"
    assert document.segments[1].speaker == "speaker_1"


def test_export_key_extension() -> None:
    import uuid

    from app.models.export import ExportType

    eid = uuid.uuid4()
    assert export_key(eid, ExportType.MARKDOWN) == f"exports/{eid}.md"
    assert export_key(eid, ExportType.SRT) == f"exports/{eid}.srt"
