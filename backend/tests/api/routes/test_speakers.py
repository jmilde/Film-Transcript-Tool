from collections.abc import Callable

from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.user import User
from app.models.video import Video
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed(db: Session, user: User) -> Video:
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
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    raw = load_deepgram_sample()
    create_transcript_from_normalized(db, video, normalize(raw), raw, created_by=user.id)
    db.flush()
    return video


def _first_speaker(db: Session, video: Video) -> Speaker:
    speaker = (
        db.execute(
            select(Speaker)
            .where(Speaker.video_id == video.id)
            .order_by(Speaker.provider_identifier)
        )
        .scalars()
        .first()
    )
    assert speaker is not None
    return speaker


def test_list_speakers(auth_client: TestClient, db_session: Session, user: User) -> None:
    video = _seed(db_session, user)

    resp = auth_client.get(f"/videos/{video.id}/speakers")

    assert resp.status_code == 200
    body = resp.json()
    assert [s["provider_identifier"] for s in body] == ["speaker_0", "speaker_1"]
    assert all(s["name"] is None for s in body)


def test_rename_speaker(auth_client: TestClient, db_session: Session, user: User) -> None:
    video = _seed(db_session, user)
    speaker = _first_speaker(db_session, video)

    resp = auth_client.patch(f"/speakers/{speaker.id}", json={"name": "John"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "John"
    # Rename propagates: listing the video's speakers reflects it.
    listed = auth_client.get(f"/videos/{video.id}/speakers").json()
    assert listed[0]["name"] == "John"


def test_rename_speaker_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    video = _seed(db_session, user)
    speaker = _first_speaker(db_session, video)

    other = app_client(other_user)
    resp = other.patch(f"/speakers/{speaker.id}", json={"name": "Mallory"})
    assert resp.status_code == 403


def test_rename_speaker_viewer_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    video = _seed(db_session, user)
    speaker = _first_speaker(db_session, video)
    db_session.add(
        ProjectMembership(
            project_id=video.project_id, user_id=other_user.id, role=MembershipRole.VIEWER
        )
    )
    db_session.flush()

    other = app_client(other_user)
    resp = other.patch(f"/speakers/{speaker.id}", json={"name": "Mallory"})
    assert resp.status_code == 403
