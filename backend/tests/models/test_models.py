import uuid
from datetime import datetime

from app.models import AssetType, Folder, Project, ProjectMembership, User, Video, VideoAsset
from sqlalchemy.orm import Session


def test_user_timestamps_populate_on_flush(db_session: Session) -> None:
    user = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com")
    db_session.add(user)
    db_session.flush()

    assert isinstance(user.created_at, datetime)
    assert isinstance(user.updated_at, datetime)
    assert user.display_name is None


def test_project_defaults(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    assert isinstance(project.id, uuid.UUID)
    assert isinstance(project.created_at, datetime)
    assert project.archived_at is None
    assert project.description is None


def test_project_membership_links_user_and_project(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    membership = ProjectMembership(project_id=project.id, user_id=user.id)
    db_session.add(membership)
    db_session.flush()

    assert membership.project_id == project.id
    assert membership.user_id == user.id
    assert isinstance(membership.created_at, datetime)


def test_folder_self_nesting(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    parent = Folder(project_id=project.id, name="Parent", created_by=user.id, updated_by=user.id)
    db_session.add(parent)
    db_session.flush()

    child = Folder(
        project_id=project.id,
        parent_folder_id=parent.id,
        name="Child",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(child)
    db_session.flush()

    assert parent.parent_folder_id is None
    assert child.parent_folder_id == parent.id


def test_video_and_asset_enum(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    video = Video(
        folder_id=folder.id,
        name="Clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()

    asset = VideoAsset(
        video_id=video.id,
        type=AssetType.ORIGINAL,
        storage_path="videos/clip/original.mp4",
    )
    db_session.add(asset)
    db_session.flush()
    db_session.refresh(asset)

    assert asset.type is AssetType.ORIGINAL
    assert video.duration is None
