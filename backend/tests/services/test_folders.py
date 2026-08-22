from app.models.folder import Folder
from app.models.project import Project
from app.models.user import User
from app.services.folders import build_folder_breadcrumbs
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
