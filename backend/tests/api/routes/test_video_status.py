import uuid
from collections.abc import Callable
from pathlib import Path
from typing import cast

from app.api.deps import get_storage
from app.models.job import JobStatus, ProcessingJob
from app.models.user import User
from app.storage.local import LocalStorage
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _use_tmp_storage(client: TestClient, tmp_path: Path) -> None:
    app = cast(FastAPI, client.app)
    app.dependency_overrides[get_storage] = lambda: LocalStorage(tmp_path)


def _make_folder(client: TestClient) -> str:
    pid = client.post("/projects", json={"name": "P"}).json()["id"]
    return str(client.post(f"/projects/{pid}/folders", json={"name": "F"}).json()["id"])


def _upload(client: TestClient, folder_id: str, filename: str = "clip.mp4") -> str:
    return str(
        client.post(
            f"/folders/{folder_id}/videos",
            files={"file": (filename, b"bytes", "video/mp4")},
        ).json()["video_id"]
    )


def test_status_empty_ids_returns_empty_list(auth_client: TestClient, tmp_path: Path) -> None:
    _use_tmp_storage(auth_client, tmp_path)

    resp = auth_client.get("/videos/status", params={"ids": ""})

    assert resp.status_code == 200
    assert resp.json() == []


def test_status_missing_ids_param_returns_empty_list(auth_client: TestClient) -> None:
    resp = auth_client.get("/videos/status")

    assert resp.status_code == 200
    assert resp.json() == []


def test_status_returns_processing_for_freshly_uploaded_video(
    auth_client: TestClient, tmp_path: Path
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    vid = _upload(auth_client, fid)

    resp = auth_client.get("/videos/status", params={"ids": vid})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["video_id"] == vid
    assert body[0]["status"] == "processing"
    assert [j["type"] for j in body[0]["jobs"]] == ["extract_metadata"]


def test_status_reports_ready_when_all_jobs_completed(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    vid = _upload(auth_client, fid)
    job = db_session.query(ProcessingJob).filter(ProcessingJob.video_id == uuid.UUID(vid)).one()
    job.status = JobStatus.COMPLETED
    db_session.flush()

    resp = auth_client.get("/videos/status", params={"ids": vid})

    assert resp.json()[0]["status"] == "ready"


def test_status_reports_failed_when_any_job_failed(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    vid = _upload(auth_client, fid)
    job = db_session.query(ProcessingJob).filter(ProcessingJob.video_id == uuid.UUID(vid)).one()
    job.status = JobStatus.FAILED
    job.error_message = "boom"
    db_session.flush()

    resp = auth_client.get("/videos/status", params={"ids": vid})

    assert resp.json()[0]["status"] == "failed"


def test_status_omits_foreign_video_without_error(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    tmp_path: Path,
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    vid = _upload(auth_client, fid)

    other = app_client(other_user)
    resp = other.get("/videos/status", params={"ids": vid})

    assert resp.status_code == 200
    assert resp.json() == []


def test_status_handles_mixed_valid_invalid_and_foreign_ids(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    tmp_path: Path,
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    mine = _upload(auth_client, fid)

    other = app_client(other_user)
    _use_tmp_storage(other, tmp_path)
    other_fid = _make_folder(other)
    foreign = _upload(other, other_fid)

    not_found = str(uuid.uuid4())
    ids = f"{mine},not-a-uuid,{foreign},{not_found}"

    resp = auth_client.get("/videos/status", params={"ids": ids})

    assert resp.status_code == 200
    body = resp.json()
    assert [v["video_id"] for v in body] == [mine]
