from collections.abc import Callable

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


def _seed_project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    db.flush()
    return project


def _seed_transcript(db: Session, user: User, project: Project, name: str = "clip") -> Transcript:
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


def _first_token(db: Session, transcript: Transcript) -> TranscriptToken:
    segment = (
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .first()
    )
    assert segment is not None
    token = (
        db.execute(
            select(TranscriptToken)
            .where(TranscriptToken.segment_id == segment.id)
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .first()
    )
    assert token is not None
    return token


def test_create_list_and_get_document(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = _seed_project(db_session, user)

    created = auth_client.post(f"/projects/{project.id}/documents", json={"title": "Narration"})
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Narration"
    assert body["version"] == 1
    assert body["content"] == {"type": "doc", "content": []}

    listed = auth_client.get(f"/projects/{project.id}/documents").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]
    assert "content" not in listed[0]

    fetched = auth_client.get(f"/documents/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Narration"


def test_update_document_happy_path(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = _seed_project(db_session, user)
    document = auth_client.post(f"/projects/{project.id}/documents", json={"title": "Draft"}).json()

    resp = auth_client.patch(
        f"/documents/{document['id']}",
        json={
            "title": "Renamed",
            "content": {"type": "doc", "content": [{"type": "paragraph"}]},
            "expected_version": 1,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["version"] == 2


def test_update_document_stale_version_returns_409(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = _seed_project(db_session, user)
    document = auth_client.post(f"/projects/{project.id}/documents", json={"title": "Draft"}).json()

    resp = auth_client.patch(
        f"/documents/{document['id']}",
        json={"title": "Stale", "expected_version": 999},
    )

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_delete_document(auth_client: TestClient, db_session: Session, user: User) -> None:
    project = _seed_project(db_session, user)
    document = auth_client.post(f"/projects/{project.id}/documents", json={"title": "Draft"}).json()

    resp = auth_client.delete(f"/documents/{document['id']}")
    assert resp.status_code == 204

    assert auth_client.get(f"/documents/{document['id']}").status_code == 404


def test_resolve_clip_block_route(auth_client: TestClient, db_session: Session, user: User) -> None:
    project = _seed_project(db_session, user)
    transcript = _seed_transcript(db_session, user, project)
    token = _first_token(db_session, transcript)
    document = auth_client.post(f"/projects/{project.id}/documents", json={"title": "Draft"}).json()

    resp = auth_client.post(
        f"/documents/{document['id']}/clip-blocks/resolve",
        json={
            "transcript_id": str(transcript.id),
            "start_token_id": str(token.id),
            "end_token_id": str(token.id),
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["excerpt"] == "Hello"
    assert body["video_id"] == str(transcript.video_id)


def test_resolve_clip_block_cross_project_not_leaked_as_403(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project_a = _seed_project(db_session, user)
    project_b = _seed_project(db_session, user)
    transcript_b = _seed_transcript(db_session, user, project_b, "b")
    token_b = _first_token(db_session, transcript_b)
    document_a = auth_client.post(
        f"/projects/{project_a.id}/documents", json={"title": "Draft"}
    ).json()

    resp = auth_client.post(
        f"/documents/{document_a['id']}/clip-blocks/resolve",
        json={
            "transcript_id": str(transcript_b.id),
            "start_token_id": str(token_b.id),
            "end_token_id": str(token_b.id),
        },
    )

    assert resp.status_code == 404


def test_create_document_non_member_forbidden(
    app_client: Callable[[User], TestClient], db_session: Session, user: User, other_user: User
) -> None:
    project = _seed_project(db_session, user)

    other = app_client(other_user)
    resp = other.post(f"/projects/{project.id}/documents", json={"title": "sneaky"})

    assert resp.status_code == 403


def test_create_document_viewer_forbidden(
    app_client: Callable[[User], TestClient], db_session: Session, user: User, other_user: User
) -> None:
    project = _seed_project(db_session, user)
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=other_user.id, role=MembershipRole.VIEWER)
    )
    db_session.flush()

    other = app_client(other_user)
    resp = other.post(f"/projects/{project.id}/documents", json={"title": "sneaky"})

    assert resp.status_code == 403


def test_get_document_unknown_id_returns_404(auth_client: TestClient) -> None:
    resp = auth_client.get("/documents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
