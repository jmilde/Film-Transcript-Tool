import uuid
from collections.abc import Callable
from pathlib import Path
from typing import cast

from app.api.deps import get_storage
from app.models.asset import AssetType, VideoAsset
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.storage.local import LocalStorage
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


def _use_tmp_storage(client: TestClient, tmp_path: Path) -> None:
    app = cast(FastAPI, client.app)
    app.dependency_overrides[get_storage] = lambda: LocalStorage(tmp_path)


def _make_folder(client: TestClient) -> str:
    pid = client.post("/projects", json={"name": "P"}).json()["id"]
    return str(client.post(f"/projects/{pid}/folders", json={"name": "F"}).json()["id"])


def test_upload_valid_mp4(auth_client: TestClient, tmp_path: Path) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)

    resp = auth_client.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mp4", b"fake-video-bytes", "video/mp4")},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert uuid.UUID(body["video_id"])
    assert uuid.UUID(body["processing_job_id"])
    # Original bytes were stored under the video's key.
    stored = tmp_path / "videos" / body["video_id"] / "original.mp4"
    assert stored.read_bytes() == b"fake-video-bytes"


def test_upload_rejects_unsupported_format(auth_client: TestClient, tmp_path: Path) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)

    resp = auth_client.post(
        f"/folders/{fid}/videos",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BAD_REQUEST"


def test_upload_enqueues_metadata_job(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)

    body = auth_client.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mov", b"x", "video/quicktime")},
    ).json()

    job = db_session.get(ProcessingJob, uuid.UUID(body["processing_job_id"]))
    assert job is not None
    assert job.type is JobType.EXTRACT_METADATA
    assert job.status is JobStatus.PENDING


def test_get_video_returns_assets_and_jobs(auth_client: TestClient, tmp_path: Path) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    vid = auth_client.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mp4", b"x", "video/mp4")},
    ).json()["video_id"]

    resp = auth_client.get(f"/videos/{vid}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == vid
    assert [a["type"] for a in body["assets"]] == ["original"]
    assert [j["type"] for j in body["jobs"]] == ["extract_metadata"]


def test_delete_video_cascades(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)
    body = auth_client.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mp4", b"x", "video/mp4")},
    ).json()
    vid = uuid.UUID(body["video_id"])

    resp = auth_client.delete(f"/videos/{vid}")
    assert resp.status_code == 204

    db_session.expire_all()
    assets = (
        db_session.execute(select(VideoAsset.id).where(VideoAsset.video_id == vid)).scalars().all()
    )
    jobs = (
        db_session.execute(select(ProcessingJob.id).where(ProcessingJob.video_id == vid))
        .scalars()
        .all()
    )
    assert assets == []
    assert jobs == []
    # Stored original file was removed too.
    assert not (tmp_path / "videos" / str(vid) / "original.mp4").exists()


def test_upload_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    tmp_path: Path,
) -> None:
    _use_tmp_storage(auth_client, tmp_path)
    fid = _make_folder(auth_client)

    other = app_client(other_user)
    _use_tmp_storage(other, tmp_path)
    resp = other.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mp4", b"x", "video/mp4")},
    )
    assert resp.status_code == 403


# --- Media streaming (proxy / waveform / media-token) ---


def _upload_video(client: TestClient, tmp_path: Path) -> str:
    _use_tmp_storage(client, tmp_path)
    fid = _make_folder(client)
    body = client.post(
        f"/folders/{fid}/videos",
        files={"file": ("clip.mp4", b"original-bytes", "video/mp4")},
    ).json()
    return str(body["video_id"])


def _add_asset(
    db_session: Session,
    tmp_path: Path,
    video_id: str,
    asset_type: AssetType,
    key: str,
    data: bytes,
    mime: str,
) -> None:
    path = tmp_path / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    db_session.add(
        VideoAsset(
            video_id=uuid.UUID(video_id),
            type=asset_type,
            storage_path=key,
            mime_type=mime,
            size=len(data),
        )
    )
    db_session.flush()


def test_media_token_and_proxy_stream(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    vid = _upload_video(auth_client, tmp_path)
    _add_asset(
        db_session,
        tmp_path,
        vid,
        AssetType.PROXY,
        f"videos/{vid}/proxy.mp4",
        b"proxy-bytes",
        "video/mp4",
    )

    token = auth_client.get(f"/videos/{vid}/media-token").json()["token"]
    resp = auth_client.get(f"/videos/{vid}/proxy", params={"token": token})

    assert resp.status_code == 200
    assert resp.content == b"proxy-bytes"


def test_proxy_range_request_returns_206(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    vid = _upload_video(auth_client, tmp_path)
    _add_asset(
        db_session,
        tmp_path,
        vid,
        AssetType.PROXY,
        f"videos/{vid}/proxy.mp4",
        b"proxy-bytes-0123456789",
        "video/mp4",
    )
    token = auth_client.get(f"/videos/{vid}/media-token").json()["token"]

    resp = auth_client.get(
        f"/videos/{vid}/proxy", params={"token": token}, headers={"Range": "bytes=0-3"}
    )

    assert resp.status_code == 206
    assert resp.content == b"prox"
    assert resp.headers["content-range"] == "bytes 0-3/22"


def test_proxy_falls_back_to_original(auth_client: TestClient, tmp_path: Path) -> None:
    # Only the ORIGINAL asset exists (written by the upload); no PROXY yet.
    vid = _upload_video(auth_client, tmp_path)
    token = auth_client.get(f"/videos/{vid}/media-token").json()["token"]

    resp = auth_client.get(f"/videos/{vid}/proxy", params={"token": token})

    assert resp.status_code == 200
    assert resp.content == b"original-bytes"


def test_proxy_rejects_invalid_token(auth_client: TestClient, tmp_path: Path) -> None:
    vid = _upload_video(auth_client, tmp_path)

    resp = auth_client.get(f"/videos/{vid}/proxy", params={"token": "bogus.1.sig"})

    assert resp.status_code == 401


def test_media_token_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    tmp_path: Path,
) -> None:
    vid = _upload_video(auth_client, tmp_path)

    resp = app_client(other_user).get(f"/videos/{vid}/media-token")

    assert resp.status_code == 403


def test_waveform_returns_peaks(
    auth_client: TestClient, tmp_path: Path, db_session: Session
) -> None:
    vid = _upload_video(auth_client, tmp_path)
    _add_asset(
        db_session,
        tmp_path,
        vid,
        AssetType.WAVEFORM,
        f"videos/{vid}/waveform.json",
        b'{"version": 1, "sample_rate": 100, "peaks": [0.1, 0.9]}',
        "application/json",
    )

    resp = auth_client.get(f"/videos/{vid}/waveform")

    assert resp.status_code == 200
    assert resp.json() == {"version": 1, "sample_rate": 100, "peaks": [0.1, 0.9]}


def test_waveform_missing_returns_404(auth_client: TestClient, tmp_path: Path) -> None:
    vid = _upload_video(auth_client, tmp_path)

    resp = auth_client.get(f"/videos/{vid}/waveform")

    assert resp.status_code == 404


def test_waveform_non_member_forbidden(
    auth_client: TestClient,
    app_client: Callable[[User], TestClient],
    other_user: User,
    tmp_path: Path,
) -> None:
    vid = _upload_video(auth_client, tmp_path)

    resp = app_client(other_user).get(f"/videos/{vid}/waveform")

    assert resp.status_code == 403
