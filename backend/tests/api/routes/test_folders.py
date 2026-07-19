import uuid
from collections.abc import Callable

from app.models.folder import Folder
from app.models.user import User
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


def _make_project(client: TestClient) -> str:
    return str(client.post("/projects", json={"name": "P"}).json()["id"])


def _make_folder(client: TestClient, project_id: str, name: str, parent: str | None = None) -> str:
    resp = client.post(
        f"/projects/{project_id}/folders",
        json={"name": name, "parent_folder_id": parent},
    )
    return str(resp.json()["id"])


def test_create_folder_root_and_nested(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)

    root = auth_client.post(f"/projects/{pid}/folders", json={"name": "Interviews"})
    assert root.status_code == 201
    assert root.json()["parent_folder_id"] is None
    rid = root.json()["id"]

    child = auth_client.post(
        f"/projects/{pid}/folders", json={"name": "Sub", "parent_folder_id": rid}
    )
    assert child.status_code == 201
    assert child.json()["parent_folder_id"] == rid


def test_create_folder_foreign_parent_rejected(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = _make_project(auth_client)
    other_pid = _make_project(app_client(other_user))
    foreign_folder = _make_folder(app_client(other_user), other_pid, "Foreign")

    resp = auth_client.post(
        f"/projects/{pid}/folders",
        json={"name": "Bad", "parent_folder_id": foreign_folder},
    )
    assert resp.status_code == 400


def test_list_folder_contents(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    rid = _make_folder(auth_client, pid, "A")
    _make_folder(auth_client, pid, "B", parent=rid)

    resp = auth_client.get(f"/folders/{rid}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["folder"]["id"] == rid
    assert [f["name"] for f in body["folders"]] == ["B"]
    assert body["videos"] == []


def test_list_root_folders(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    _make_folder(auth_client, pid, "Beta")
    a = _make_folder(auth_client, pid, "Alpha")
    _make_folder(auth_client, pid, "Nested", parent=a)  # not a root folder

    resp = auth_client.get(f"/projects/{pid}/folders")

    assert resp.status_code == 200
    # Only top-level folders, ordered by name.
    assert [f["name"] for f in resp.json()] == ["Alpha", "Beta"]
    assert all(f["parent_folder_id"] is None for f in resp.json())


def test_list_root_folders_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = _make_project(auth_client)

    resp = app_client(other_user).get(f"/projects/{pid}/folders")

    assert resp.status_code == 403


def test_rename_folder(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    rid = _make_folder(auth_client, pid, "A")

    resp = auth_client.patch(f"/folders/{rid}", json={"name": "A2"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "A2"


def test_move_folder(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    a = _make_folder(auth_client, pid, "A")
    b = _make_folder(auth_client, pid, "B")

    moved = auth_client.patch(f"/folders/{b}", json={"parent_folder_id": a})
    assert moved.status_code == 200
    assert moved.json()["parent_folder_id"] == a

    back = auth_client.patch(f"/folders/{b}", json={"parent_folder_id": None})
    assert back.json()["parent_folder_id"] is None


def test_move_into_descendant_rejected(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    a = _make_folder(auth_client, pid, "A")
    b = _make_folder(auth_client, pid, "B", parent=a)

    resp = auth_client.patch(f"/folders/{a}", json={"parent_folder_id": b})

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BAD_REQUEST"


def test_move_into_self_rejected(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)
    a = _make_folder(auth_client, pid, "A")

    resp = auth_client.patch(f"/folders/{a}", json={"parent_folder_id": a})

    assert resp.status_code == 400


def test_cascade_delete_removes_children(auth_client: TestClient, db_session: Session) -> None:
    pid = _make_project(auth_client)
    a = _make_folder(auth_client, pid, "A")
    b = _make_folder(auth_client, pid, "B", parent=a)

    resp = auth_client.delete(f"/folders/{a}")
    assert resp.status_code == 204

    db_session.expire_all()
    remaining = db_session.execute(
        select(Folder.id).where(Folder.id == uuid.UUID(b))
    ).scalar_one_or_none()
    assert remaining is None


def test_folder_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = _make_project(auth_client)
    rid = _make_folder(auth_client, pid, "A")

    resp = app_client(other_user).get(f"/folders/{rid}")

    assert resp.status_code == 403
