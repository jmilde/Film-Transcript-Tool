from collections.abc import Callable

from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed_transcript(db: Session, user: User) -> tuple[Video, Transcript]:
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
    return video, transcript


def test_list_transcripts(auth_client: TestClient, db_session: Session, user: User) -> None:
    video, transcript = _seed_transcript(db_session, user)

    resp = auth_client.get(f"/videos/{video.id}/transcripts")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["id"] == str(transcript.id)
    assert body[0]["language"] == "en"
    assert body[0]["type"] == "original"


def test_get_transcript_returns_segments_and_tokens(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    _video, transcript = _seed_transcript(db_session, user)

    resp = auth_client.get(f"/transcripts/{transcript.id}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["language"] == "en"
    assert len(body["segments"]) == 2
    first = body["segments"][0]
    assert first["speaker_id"] is not None
    assert [t["text"] for t in first["tokens"]] == ["Hello", "there."]
    assert first["tokens"][0]["start_time"] == 0.0
    assert body["segments"][1]["tokens"][-1]["text"] == "you?"


def test_get_transcript_uses_edited_text_for_display(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    _video, transcript = _seed_transcript(db_session, user)
    token = (
        db_session.execute(
            select(TranscriptToken)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .first()
    )
    assert token is not None
    token.edited_text = "Hi"
    db_session.flush()

    resp = auth_client.get(f"/transcripts/{transcript.id}")

    tokens = resp.json()["segments"][0]["tokens"]
    assert tokens[0]["text"] == "Hi"
    assert tokens[0]["original_text"] == "Hello"
    assert tokens[0]["edited_text"] == "Hi"


def test_get_transcript_excludes_deleted_tokens(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    _video, transcript = _seed_transcript(db_session, user)
    token = (
        db_session.execute(
            select(TranscriptToken)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .first()
    )
    assert token is not None
    token.is_deleted = True
    db_session.flush()

    resp = auth_client.get(f"/transcripts/{transcript.id}")

    texts = [t["text"] for seg in resp.json()["segments"] for t in seg["tokens"]]
    assert "Hello" not in texts
    assert "there." in texts


def test_get_transcript_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    _video, transcript = _seed_transcript(db_session, user)

    other = app_client(other_user)
    resp = other.get(f"/transcripts/{transcript.id}")
    assert resp.status_code == 403
