from collections.abc import Callable
from typing import Any

from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
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


def _seed(db: Session, user: User, name: str = "clip") -> Transcript:
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


def test_create_and_list_comment(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _tokens(db_session, transcript, 0)  # Hello 0.0-0.4 / there. 0.4-0.8

    resp = auth_client.post(
        f"/transcripts/{transcript.id}/comments",
        json={
            "start_token_id": str(tokens[0].id),
            "end_token_id": str(tokens[1].id),
            "text": "Check this quote",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Check this quote"
    assert body["resolved"] is False
    assert body["anchor"]["kind"] == "transcript"
    assert body["anchor"]["transcript_id"] == str(transcript.id)
    assert body["anchor"]["in_time"] == 0.0
    assert body["anchor"]["out_time"] == 0.8
    assert body["replies"] == []

    listed = auth_client.get(f"/transcripts/{transcript.id}/comments").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_reply_to_comment(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _tokens(db_session, transcript, 0)
    comment = auth_client.post(
        f"/transcripts/{transcript.id}/comments",
        json={
            "start_token_id": str(tokens[0].id),
            "end_token_id": str(tokens[1].id),
            "text": "Check this quote",
        },
    ).json()

    resp = auth_client.post(f"/comments/{comment['id']}/replies", json={"text": "Good point"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["replies"]) == 1
    assert body["replies"][0]["text"] == "Good point"


def test_resolve_comment(auth_client: TestClient, db_session: Session, user: User) -> None:
    transcript = _seed(db_session, user)
    tokens = _tokens(db_session, transcript, 0)
    comment = auth_client.post(
        f"/transcripts/{transcript.id}/comments",
        json={
            "start_token_id": str(tokens[0].id),
            "end_token_id": str(tokens[1].id),
            "text": "Check this quote",
        },
    ).json()

    resp = auth_client.patch(f"/comments/{comment['id']}", json={"resolved": True})

    assert resp.status_code == 200
    assert resp.json()["resolved"] is True


def test_create_comment_cross_transcript_rejected(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    transcript_a = _seed(db_session, user, "a")
    transcript_b = _seed(db_session, user, "b")
    start = _tokens(db_session, transcript_a, 0)[0]
    end = _tokens(db_session, transcript_b, 0)[0]

    resp = auth_client.post(
        f"/transcripts/{transcript_a.id}/comments",
        json={
            "start_token_id": str(start.id),
            "end_token_id": str(end.id),
            "text": "straddles",
        },
    )

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "COMMENT_RANGE_INVALID"


def test_create_comment_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    transcript = _seed(db_session, user)
    tokens = _tokens(db_session, transcript, 0)

    other = app_client(other_user)
    resp = other.post(
        f"/transcripts/{transcript.id}/comments",
        json={
            "start_token_id": str(tokens[0].id),
            "end_token_id": str(tokens[1].id),
            "text": "sneaky",
        },
    )
    assert resp.status_code == 403


def _seed_document(auth_client: TestClient, project_id: str) -> dict[str, Any]:
    result: dict[str, Any] = auth_client.post(
        f"/projects/{project_id}/documents", json={"title": "Draft"}
    ).json()
    return result


def test_create_and_list_document_comment(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER)
    )
    db_session.flush()
    document = _seed_document(auth_client, str(project.id))

    resp = auth_client.post(
        f"/documents/{document['id']}/comments",
        json={"clip_node_id": "node-1", "text": "Nice moment"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Nice moment"
    assert body["anchor"]["kind"] == "document"
    assert body["anchor"]["document_id"] == document["id"]
    assert body["anchor"]["clip_node_id"] == "node-1"
    assert body["anchor"]["excerpt"] is None  # clip node not present in content yet
    assert body["replies"] == []

    listed = auth_client.get(f"/documents/{document['id']}/comments").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_create_document_comment_prose_anchor(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER)
    )
    db_session.flush()
    document = _seed_document(auth_client, str(project.id))

    resp = auth_client.post(
        f"/documents/{document['id']}/comments",
        json={"text": "Rephrase this"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["anchor"]["kind"] == "document"
    assert body["anchor"]["clip_node_id"] is None


def test_create_document_comment_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    auth_client: TestClient,
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER)
    )
    db_session.flush()
    document = _seed_document(auth_client, str(project.id))

    other = app_client(other_user)
    resp = other.post(f"/documents/{document['id']}/comments", json={"text": "sneaky"})

    assert resp.status_code == 403


def test_create_document_comment_viewer_forbidden(
    app_client: Callable[[User], TestClient],
    auth_client: TestClient,
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER)
    )
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=other_user.id, role=MembershipRole.VIEWER)
    )
    db_session.flush()
    document = _seed_document(auth_client, str(project.id))

    other = app_client(other_user)
    resp = other.post(f"/documents/{document['id']}/comments", json={"text": "sneaky"})

    assert resp.status_code == 403


def test_create_comment_viewer_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    transcript = _seed(db_session, user)
    tokens = _tokens(db_session, transcript, 0)
    db_session.add(
        ProjectMembership(
            project_id=transcript.project_id, user_id=other_user.id, role=MembershipRole.VIEWER
        )
    )
    db_session.flush()

    other = app_client(other_user)
    resp = other.post(
        f"/transcripts/{transcript.id}/comments",
        json={
            "start_token_id": str(tokens[0].id),
            "end_token_id": str(tokens[1].id),
            "text": "sneaky",
        },
    )
    assert resp.status_code == 403
