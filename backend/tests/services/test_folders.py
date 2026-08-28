from app.models.folder import Folder
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from app.services.folders import build_folder_breadcrumbs, resolve_descendant_video_ids
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


def test_breadcrumbs_flat_folder(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user, "Root")

    result = build_folder_breadcrumbs(db_session, [folder.id])

    assert result == {folder.id: ["Root"]}


def test_breadcrumbs_nested_folder(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    child = _folder(db_session, project, user, "Child", parent=root)
    grandchild = _folder(db_session, project, user, "Grandchild", parent=child)

    result = build_folder_breadcrumbs(db_session, [grandchild.id])

    assert result == {grandchild.id: ["Root", "Child", "Grandchild"]}


def test_breadcrumbs_shared_ancestor_batches_by_depth(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    child_a = _folder(db_session, project, user, "A", parent=root)
    child_b = _folder(db_session, project, user, "B", parent=root)

    result = build_folder_breadcrumbs(db_session, [child_a.id, child_b.id])

    assert result == {
        child_a.id: ["Root", "A"],
        child_b.id: ["Root", "B"],
    }


def test_breadcrumbs_empty_input(db_session: Session, user: User) -> None:
    assert build_folder_breadcrumbs(db_session, []) == {}


def _video(db: Session, project: Project, folder: Folder, user: User, name: str = "clip") -> Video:
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


def test_resolve_descendant_video_ids_direct_children_only(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user, "Root")
    video = _video(db_session, project, folder, user)

    result = resolve_descendant_video_ids(db_session, folder.id)

    assert result == {video.id}


def test_resolve_descendant_video_ids_multi_level_nesting(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    child = _folder(db_session, project, user, "Child", parent=root)
    grandchild = _folder(db_session, project, user, "Grandchild", parent=child)
    root_video = _video(db_session, project, root, user, name="root-clip")
    child_video = _video(db_session, project, child, user, name="child-clip")
    grandchild_video = _video(db_session, project, grandchild, user, name="grandchild-clip")

    result = resolve_descendant_video_ids(db_session, root.id)

    assert result == {root_video.id, child_video.id, grandchild_video.id}


def test_resolve_descendant_video_ids_folder_with_no_subfolders(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user, "Leaf")
    video = _video(db_session, project, folder, user)

    result = resolve_descendant_video_ids(db_session, folder.id)

    assert result == {video.id}


def test_resolve_descendant_video_ids_no_videos_anywhere(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    _folder(db_session, project, user, "Child", parent=root)

    result = resolve_descendant_video_ids(db_session, root.id)

    assert result == set()


def test_resolve_descendant_video_ids_excludes_sibling_folder(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    target = _folder(db_session, project, user, "Target", parent=root)
    sibling = _folder(db_session, project, user, "Sibling", parent=root)
    target_video = _video(db_session, project, target, user, name="target-clip")
    _video(db_session, project, sibling, user, name="sibling-clip")

    result = resolve_descendant_video_ids(db_session, target.id)

    assert result == {target_video.id}
