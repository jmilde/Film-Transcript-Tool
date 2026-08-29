from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

EXPECTED_TABLES = {
    "users",
    "projects",
    "project_memberships",
    "folders",
    "videos",
    "video_assets",
    "processing_jobs",
    "transcript_chunks",
    "chat_conversations",
    "chat_messages",
    "documents",
}


def test_migration_created_all_tables(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    tables = set(inspector.get_table_names())

    assert EXPECTED_TABLES <= tables


def test_video_assets_has_composite_index(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    index_columns = [tuple(ix["column_names"]) for ix in inspector.get_indexes("video_assets")]

    assert ("video_id", "type") in index_columns


def test_transcript_chunks_has_search_and_vector_indexes(db_session: Session) -> None:
    indexes = db_session.execute(
        text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'transcript_chunks'")
    ).all()
    index_defs = {row[0]: row[1] for row in indexes}

    assert "ix_transcript_chunks_search_vector" in index_defs
    assert "USING gin" in index_defs["ix_transcript_chunks_search_vector"]
    assert "ix_transcript_chunks_embedding" in index_defs
    assert "USING hnsw" in index_defs["ix_transcript_chunks_embedding"]
    assert "vector_cosine_ops" in index_defs["ix_transcript_chunks_embedding"]


def test_project_memberships_has_role_column(db_session: Session) -> None:
    inspector = inspect(db_session.get_bind())
    columns = {col["name"]: col for col in inspector.get_columns("project_memberships")}

    assert "role" in columns
    assert not columns["role"]["nullable"]
