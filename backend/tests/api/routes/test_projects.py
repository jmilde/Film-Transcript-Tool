import uuid
from collections.abc import Callable

from app.models.document import Document
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.user import User
from app.models.video import Video
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_create_project(auth_client: TestClient) -> None:
    resp = auth_client.post("/projects", json={"name": "Doc", "description": "d"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Doc"
    assert body["description"] == "d"
    assert body["archived_at"] is None
    assert body["my_role"] == "owner"
    assert uuid.UUID(body["id"])
    assert body["video_count"] == 0
    assert body["member_count"] == 1
    assert body["document_count"] == 0


def test_project_counts_reflect_videos_members_documents(
    auth_client: TestClient,
    user: User,
    other_user: User,
    db_session: Session,
) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]
    project_id = uuid.UUID(pid)
    folder = Folder(project_id=project_id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    db_session.add(
        Video(
            folder_id=folder.id,
            project_id=project_id,
            name="V",
            original_filename="v.mp4",
            created_by=user.id,
            updated_by=user.id,
        )
    )
    db_session.add(
        Document(
            project_id=project_id,
            title="D",
            content={"type": "doc", "content": []},
            created_by=user.id,
            updated_by=user.id,
        )
    )
    db_session.add(
        ProjectMembership(project_id=project_id, user_id=other_user.id, role=MembershipRole.VIEWER)
    )
    db_session.flush()

    resp = auth_client.get(f"/projects/{pid}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["video_count"] == 1
    assert body["member_count"] == 2
    assert body["document_count"] == 1


def test_list_projects_only_members(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    auth_client.post("/projects", json={"name": "Mine"})
    app_client(other_user).post("/projects", json={"name": "Theirs"})

    resp = auth_client.get("/projects")

    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()] == ["Mine"]


def test_get_project(auth_client: TestClient) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]

    resp = auth_client.get(f"/projects/{pid}")

    assert resp.status_code == 200
    assert resp.json()["id"] == pid


def test_get_missing_project_404(auth_client: TestClient) -> None:
    resp = auth_client.get(f"/projects/{uuid.uuid4()}")

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]

    resp = app_client(other_user).get(f"/projects/{pid}")

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_update_and_archive(auth_client: TestClient) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]

    updated = auth_client.patch(f"/projects/{pid}", json={"name": "P2", "archived": True})
    assert updated.status_code == 200
    assert updated.json()["name"] == "P2"
    assert updated.json()["archived_at"] is not None

    unarchived = auth_client.patch(f"/projects/{pid}", json={"archived": False})
    assert unarchived.json()["archived_at"] is None


def test_update_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]

    resp = app_client(other_user).patch(f"/projects/{pid}", json={"name": "hijack"})

    assert resp.status_code == 403


def test_update_viewer_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    db_session: Session,
) -> None:
    pid = auth_client.post("/projects", json={"name": "P"}).json()["id"]
    db_session.add(
        ProjectMembership(
            project_id=uuid.UUID(pid), user_id=other_user.id, role=MembershipRole.VIEWER
        )
    )
    db_session.flush()

    resp = app_client(other_user).patch(f"/projects/{pid}", json={"name": "hijack"})

    assert resp.status_code == 403
