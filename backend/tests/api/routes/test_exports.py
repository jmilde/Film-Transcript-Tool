import uuid
from collections.abc import Callable
from pathlib import Path

import pytest
from app.api import deps
from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.storage import factory
from app.storage.local import LocalStorage
from app.transcription.normalize import normalize
from app.worker.runner import run_once
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _use_tmp_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Point both storage entry points at one tmp root.

    The worker handler resolves storage through ``app.storage.factory``; the
    download route through ``app.api.deps.get_storage`` (which imported
    ``get_local_storage`` by name). Patch both so the file the worker writes is
    the file the route reads.
    """
    storage = LocalStorage(tmp_path)
    monkeypatch.setattr(factory, "get_local_storage", lambda: storage)
    monkeypatch.setattr(deps, "get_local_storage", lambda: storage)


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


def test_export_lifecycle(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _use_tmp_storage(monkeypatch, tmp_path)
    transcript = _seed(db_session, user)
    db_session.commit()

    client = app_client(user)

    created = client.post(f"/transcripts/{transcript.id}/exports", json={"format": "markdown"})
    assert created.status_code == 200
    export_id = created.json()["export_id"]

    # Before the worker runs, the export is not ready and the file 404s.
    meta = client.get(f"/exports/{export_id}").json()
    assert meta["ready"] is False
    assert meta["type"] == "markdown"
    assert client.get(f"/exports/{export_id}/content").status_code == 404

    processed = run_once(db_session)
    assert processed is not None

    assert client.get(f"/exports/{export_id}").json()["ready"] is True
    content = client.get(f"/exports/{export_id}/content")
    assert content.status_code == 200
    assert content.headers["content-type"].startswith("text/markdown")
    assert content.text.startswith("# clip\n\n_Language: en_\n\n")
    assert "Hello there." in content.text


def test_export_srt_content(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _use_tmp_storage(monkeypatch, tmp_path)
    transcript = _seed(db_session, user)
    db_session.commit()

    client = app_client(user)

    export_id = client.post(f"/transcripts/{transcript.id}/exports", json={"format": "srt"}).json()[
        "export_id"
    ]
    run_once(db_session)

    content = client.get(f"/exports/{export_id}/content")
    assert content.text == (
        "1\n00:00:00,000 --> 00:00:00,800\nHello there.\n\n"
        "2\n00:00:01,200 --> 00:00:01,900\nHow are you?\n"
    )


def test_create_export_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    transcript = _seed(db_session, user)

    other = app_client(other_user)
    resp = other.post(f"/transcripts/{transcript.id}/exports", json={"format": "markdown"})

    assert resp.status_code == 403


def test_get_unknown_export_404(auth_client: TestClient) -> None:
    assert auth_client.get(f"/exports/{uuid.uuid4()}").status_code == 404
