from sqlalchemy import inspect
from sqlalchemy.orm import Session

EXPECTED_TABLES = {
    "users",
    "projects",
    "project_memberships",
    "folders",
    "videos",
    "video_assets",
    "processing_jobs",
}


def test_migration_created_all_tables(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    tables = set(inspector.get_table_names())

    assert EXPECTED_TABLES <= tables


def test_video_assets_has_composite_index(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    index_columns = [tuple(ix["column_names"]) for ix in inspector.get_indexes("video_assets")]

    assert ("video_id", "type") in index_columns


def test_project_memberships_has_role_column(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    columns = {col["name"]: col for col in inspector.get_columns("project_memberships")}

    assert "role" in columns
    assert not columns["role"]["nullable"]
