from app.models.folder import Folder
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.user import User
from app.models.video import Video
from app.services.entity_lookup import lookup_entities
from sqlalchemy.orm import Session


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    return project


def _folder(
    db: Session, project: Project, user: User, name: str, parent: Folder | None = None
) -> Folder:
    folder = Folder(
        project_id=project.id,
        parent_folder_id=parent.id if parent else None,
        name=name,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(folder)
    db.flush()
    return folder


def _video(db: Session, project: Project, folder: Folder, user: User, name: str) -> Video:
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name=name,
        original_filename=f"{name}.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    return video


def _speaker(db: Session, project: Project, video: Video, name: str) -> Speaker:
    speaker = Speaker(video_id=video.id, project_id=project.id, name=name)
    db.add(speaker)
    db.flush()
    return speaker


def test_lookup_entities_partial_and_case_insensitive_match(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user, "Interviews")
    video = _video(db_session, project, folder, user, "Mariza Interview")
    _speaker(db_session, project, video, "Mariza Costa")

    result = lookup_entities(db_session, project.id, "mariza")

    assert [s.name for s in result.speakers] == ["Mariza Costa"]
    assert [v.name for v in result.videos] == ["Mariza Interview"]
    assert result.folders == []


def test_lookup_entities_no_match_returns_empty_lists(db_session: Session, user: User) -> None:
    project = _project(db_session, user)

    result = lookup_entities(db_session, project.id, "nonexistent-xyz")

    assert result.speakers == []
    assert result.videos == []
    assert result.folders == []


def test_lookup_entities_groups_shared_speaker_name_across_videos(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user, "F")
    video_a = _video(db_session, project, folder, user, "clip-a")
    video_b = _video(db_session, project, folder, user, "clip-b")
    _speaker(db_session, project, video_a, "Mariza")
    _speaker(db_session, project, video_b, "Mariza")

    result = lookup_entities(db_session, project.id, "mariza")

    assert len(result.speakers) == 1
    assert result.speakers[0].name == "Mariza"
    assert set(result.speakers[0].video_ids) == {video_a.id, video_b.id}


def test_lookup_entities_excludes_match_in_different_project(
    db_session: Session, user: User
) -> None:
    project_a = _project(db_session, user)
    project_b = _project(db_session, user)
    folder_b = _folder(db_session, project_b, user, "F")
    video_b = _video(db_session, project_b, folder_b, user, "Mariza Interview")
    _speaker(db_session, project_b, video_b, "Mariza")

    result = lookup_entities(db_session, project_a.id, "mariza")

    assert result.speakers == []
    assert result.videos == []


def test_lookup_entities_video_folder_path_nested(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    child = _folder(db_session, project, user, "Child", parent=root)
    _video(db_session, project, child, user, "Mariza clip")

    result = lookup_entities(db_session, project.id, "mariza")

    assert len(result.videos) == 1
    assert result.videos[0].folder_path == ["Root", "Child"]


def test_lookup_entities_folder_match_path_excludes_own_name(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    _folder(db_session, project, user, "Mariza Folder", parent=root)

    result = lookup_entities(db_session, project.id, "mariza")

    assert len(result.folders) == 1
    assert result.folders[0].name == "Mariza Folder"
    assert result.folders[0].path == ["Root"]


def test_lookup_entities_top_level_folder_match_has_empty_path(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    _folder(db_session, project, user, "Mariza Folder")

    result = lookup_entities(db_session, project.id, "mariza")

    assert len(result.folders) == 1
    assert result.folders[0].path == []
