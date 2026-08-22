import uuid
from collections.abc import Callable

from app.models.membership import MembershipRole, ProjectMembership
from app.models.user import User
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _make_project(client: TestClient) -> str:
    return str(client.post("/projects", json={"name": "P"}).json()["id"])


def _make_user(db: Session, email: str) -> User:
    new_user = User(id=uuid.uuid4(), email=email)
    db.add(new_user)
    db.flush()
    return new_user


def test_list_members_includes_owner(auth_client: TestClient, user: User) -> None:
    pid = _make_project(auth_client)

    resp = auth_client.get(f"/projects/{pid}/members")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["email"] == user.email
    assert body[0]["role"] == "owner"


def test_invite_existing_user(
    auth_client: TestClient,
    user: User,
    other_user: User,
) -> None:
    pid = _make_project(auth_client)

    resp = auth_client.post(
        f"/projects/{pid}/members", json={"email": other_user.email, "role": "editor"}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == other_user.email
    assert body["role"] == "editor"

    listed = auth_client.get(f"/projects/{pid}/members").json()
    assert {m["email"] for m in listed} == {other_user.email, user.email}


def test_invite_unknown_email_404(auth_client: TestClient) -> None:
    pid = _make_project(auth_client)

    resp = auth_client.post(
        f"/projects/{pid}/members", json={"email": "ghost@example.com", "role": "viewer"}
    )

    assert resp.status_code == 404


def test_invite_non_owner_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    db_session: Session,
) -> None:
    pid = _make_project(auth_client)
    db_session.add(
        ProjectMembership(
            project_id=uuid.UUID(pid), user_id=other_user.id, role=MembershipRole.EDITOR
        )
    )
    db_session.flush()

    resp = app_client(other_user).post(
        f"/projects/{pid}/members", json={"email": other_user.email, "role": "viewer"}
    )

    assert resp.status_code == 403


def test_change_role(auth_client: TestClient, other_user: User) -> None:
    pid = _make_project(auth_client)
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "viewer"})

    resp = auth_client.patch(f"/projects/{pid}/members/{other_user.id}", json={"role": "editor"})

    assert resp.status_code == 200
    assert resp.json()["role"] == "editor"


def test_change_role_non_owner_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = _make_project(auth_client)
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "editor"})

    resp = app_client(other_user).patch(
        f"/projects/{pid}/members/{other_user.id}", json={"role": "owner"}
    )

    assert resp.status_code == 403


def test_change_role_last_owner_demote_rejected(auth_client: TestClient, user: User) -> None:
    pid = _make_project(auth_client)

    resp = auth_client.patch(f"/projects/{pid}/members/{user.id}", json={"role": "editor"})

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "LAST_OWNER"


def test_remove_member_by_owner(auth_client: TestClient, other_user: User) -> None:
    pid = _make_project(auth_client)
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "viewer"})

    resp = auth_client.delete(f"/projects/{pid}/members/{other_user.id}")

    assert resp.status_code == 204
    listed = auth_client.get(f"/projects/{pid}/members").json()
    assert other_user.email not in {m["email"] for m in listed}


def test_remove_member_non_owner_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    db_session: Session,
) -> None:
    pid = _make_project(auth_client)
    target = _make_user(db_session, "target@example.com")
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "editor"})
    auth_client.post(f"/projects/{pid}/members", json={"email": target.email, "role": "viewer"})

    resp = app_client(other_user).delete(f"/projects/{pid}/members/{target.id}")

    assert resp.status_code == 403


def test_remove_member_last_owner_rejected(auth_client: TestClient, user: User) -> None:
    pid = _make_project(auth_client)

    resp = auth_client.delete(f"/projects/{pid}/members/{user.id}")

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "LAST_OWNER"


def test_leave_project_self_removal_allowed(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
) -> None:
    pid = _make_project(auth_client)
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "editor"})

    resp = app_client(other_user).delete(f"/projects/{pid}/members/{other_user.id}")

    assert resp.status_code == 204


def test_owner_can_leave_if_another_owner_remains(
    auth_client: TestClient, user: User, other_user: User
) -> None:
    pid = _make_project(auth_client)
    auth_client.post(f"/projects/{pid}/members", json={"email": other_user.email, "role": "owner"})

    resp = auth_client.delete(f"/projects/{pid}/members/{user.id}")

    assert resp.status_code == 204
