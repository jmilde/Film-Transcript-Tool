import uuid
from collections.abc import Callable

from app.models.user import User
from fastapi.testclient import TestClient


def test_create_project(auth_client: TestClient) -> None:
    resp = auth_client.post("/projects", json={"name": "Doc", "description": "d"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Doc"
    assert body["description"] == "d"
    assert body["archived_at"] is None
    assert uuid.UUID(body["id"])


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
