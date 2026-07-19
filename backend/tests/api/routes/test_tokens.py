from collections.abc import Callable

from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from fastapi.testclient import TestClient
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


def _transcript_texts(client: TestClient, transcript: Transcript) -> list[str]:
    body = client.get(f"/transcripts/{transcript.id}").json()
    return [t["text"] for seg in body["segments"] for t in seg["tokens"]]


def test_edit_token(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]

    resp = auth_client.patch(f"/tokens/{token.id}", json={"edited_text": "Hi"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["edited_text"] == "Hi"
    assert body["original_text"] == "Hello"
    assert body["text"] == "Hi"
    # Display in the full transcript reflects the edit.
    assert "Hi" in _transcript_texts(auth_client, transcript)
    assert "Hello" not in _transcript_texts(auth_client, transcript)


def test_delete_token_excluded_from_transcript(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]

    resp = auth_client.delete(f"/tokens/{token.id}")

    assert resp.status_code == 200
    assert "Hello" not in _transcript_texts(auth_client, transcript)
    # Still physically present, just flagged.
    persisted = db_session.get(TranscriptToken, token.id)
    assert persisted is not None
    assert persisted.is_deleted is True


def test_merge_tokens(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)  # How / are / you?

    resp = auth_client.post(
        "/tokens/merge",
        json={"token_ids": [str(tokens[0].id), str(tokens[1].id)], "text": "How are"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "How are"
    assert body["start_time"] == 1.2
    assert body["end_time"] == 1.6
    texts = _transcript_texts(auth_client, transcript)
    assert "How are" in texts
    assert texts == ["Hello", "there.", "How are", "you?"]


def test_merge_tokens_across_segments_rejected(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    transcript = _seed(db_session, user)
    seg0 = _segment_tokens(db_session, transcript, 0)[-1]
    seg1 = _segment_tokens(db_session, transcript, 1)[0]

    resp = auth_client.post(
        "/tokens/merge",
        json={"token_ids": [str(seg0.id), str(seg1.id)], "text": "there. How"},
    )

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "TOKEN_MERGE_CROSS_SEGMENT"


def test_split_token(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 1)[2]  # "you?"

    resp = auth_client.post(
        f"/tokens/{token.id}/split",
        json={"tokens": [{"text": "you"}, {"text": "?"}]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [t["text"] for t in body] == ["you", "?"]
    assert body[0]["start_time"] == 1.6
    assert body[1]["end_time"] == 1.9
    texts = _transcript_texts(auth_client, transcript)
    assert texts == ["Hello", "there.", "How", "are", "you", "?"]


def test_edit_token_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    transcript = _seed(db_session, user)
    token = _segment_tokens(db_session, transcript, 0)[0]

    other = app_client(other_user)
    resp = other.patch(f"/tokens/{token.id}", json={"edited_text": "Hi"})
    assert resp.status_code == 403


def test_merge_tokens_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    transcript = _seed(db_session, user)
    tokens = _segment_tokens(db_session, transcript, 1)

    other = app_client(other_user)
    resp = other.post(
        "/tokens/merge",
        json={"token_ids": [str(tokens[0].id), str(tokens[1].id)], "text": "How are"},
    )
    assert resp.status_code == 403
