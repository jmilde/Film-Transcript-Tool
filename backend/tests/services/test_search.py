from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.comments import create_comment
from app.services.search import search_project
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
    raw = load_deepgram_sample()  # words: hello there how are you
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


def test_search_matches_transcript_text(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")

    hits = search_project(db_session, project.id, "hello")

    token_hits = [hit for hit in hits if hit.kind == "transcript"]
    assert len(token_hits) == 1
    # Displayed text keeps its original case; the tsvector match is case-folded.
    assert token_hits[0].text == "Hello"
    assert token_hits[0].video_id == transcript.video_id
    assert token_hits[0].start_time is not None


def test_search_excludes_deleted_tokens(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    hello = next(
        token for token in _tokens(db_session, transcript) if token.original_text == "Hello"
    )
    hello.is_deleted = True
    db_session.flush()

    hits = search_project(db_session, project.id, "hello")

    assert [hit for hit in hits if hit.kind == "transcript"] == []


def test_search_matches_speaker_name_stemmed(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    speaker = Speaker(
        video_id=transcript.video_id,
        project_id=project.id,
        provider_identifier="speaker_9",
        name="Interviewer",
    )
    db_session.add(speaker)
    db_session.flush()

    # "interview" stems to the same root as "Interviewer".
    hits = search_project(db_session, project.id, "interview")

    speaker_hits = [hit for hit in hits if hit.kind == "speaker"]
    assert len(speaker_hits) == 1
    assert speaker_hits[0].id == speaker.id
    assert speaker_hits[0].text == "Interviewer"
    assert speaker_hits[0].start_time is None


def test_search_matches_comment_stemmed(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript)
    comment = create_comment(
        db_session,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Discussing the climate crisis",
        user_id=user.id,
    )

    # "climates" stems to the same root as "climate".
    hits = search_project(db_session, project.id, "climates")

    comment_hits = [hit for hit in hits if hit.kind == "comment"]
    assert len(comment_hits) == 1
    assert comment_hits[0].id == comment.id
    assert comment_hits[0].start_time == tokens[0].start_time


def test_search_is_project_scoped(db_session: Session, user: User) -> None:
    project_a = _project(db_session, user)
    project_b = _project(db_session, user)
    _transcript(db_session, project_a, user, "a")
    _transcript(db_session, project_b, user, "b")

    hits = search_project(db_session, project_a.id, "hello")

    assert all(hit.video_id is not None for hit in hits)
    assert len([hit for hit in hits if hit.kind == "transcript"]) == 1
