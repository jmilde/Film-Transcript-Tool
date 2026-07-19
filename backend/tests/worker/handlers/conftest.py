import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest
from app.models.asset import AssetType, VideoAsset
from app.models.folder import Folder
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.storage import factory
from app.storage.local import LocalStorage
from sqlalchemy.orm import Session


def _make_sample_clip(path: Path) -> None:
    """Render a 1-second 320x240 clip with a tone via ffmpeg itself."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=320x240:rate=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        capture_output=True,
        check=True,
    )


@dataclass
class MediaFixture:
    db: Session
    storage: LocalStorage
    video: Video
    original_key: str

    def job(self, job_type: JobType) -> ProcessingJob:
        job = ProcessingJob(
            video_id=self.video.id,
            project_id=self.video.project_id,
            type=job_type,
            status=JobStatus.PENDING,
        )
        self.db.add(job)
        self.db.flush()
        return job


@pytest.fixture
def media(
    db_session: Session, user: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> MediaFixture:
    """A persisted video whose original asset is a real clip in tmp storage.

    Points the handlers' storage factory at ``tmp_path`` so they read/write
    there, and seeds project/folder/video/original-asset rows in the rolled-back
    test transaction.
    """
    storage = LocalStorage(tmp_path)
    monkeypatch.setattr(factory, "get_local_storage", lambda: storage)

    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(ProjectMembership(project_id=project.id, user_id=user.id))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()

    original_key = f"videos/{video.id}/original.mp4"
    _make_sample_clip(storage.path_for(original_key))
    db_session.add(
        VideoAsset(
            video_id=video.id,
            type=AssetType.ORIGINAL,
            storage_path=original_key,
            mime_type="video/mp4",
        )
    )
    db_session.flush()

    return MediaFixture(db=db_session, storage=storage, video=video, original_key=original_key)


@pytest.fixture
def video_without_original(
    db_session: Session, user: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> MediaFixture:
    """A video with no original asset, for missing-input error tests."""
    storage = LocalStorage(tmp_path)
    monkeypatch.setattr(factory, "get_local_storage", lambda: storage)
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()
    return MediaFixture(
        db=db_session, storage=storage, video=video, original_key=f"videos/{video.id}/original.mp4"
    )
