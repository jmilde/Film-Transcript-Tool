import uuid
from collections.abc import Iterator

import pytest
from app.config import get_settings
from app.db.session import get_db
from app.main import create_app
from app.models import User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Tests talk to the real Supabase Postgres over the worker/session connection
# (port 5432), which supports holding a transaction open for the whole test.
_test_engine = create_engine(get_settings().database_url_worker, pool_pre_ping=True)


@pytest.fixture
def db_session() -> Iterator[Session]:
    """A session wrapped in an outer transaction that is always rolled back.

    Nothing a test writes persists: the outer transaction is rolled back in
    teardown, and the session runs inside a SAVEPOINT so it can commit/rollback
    freely without ending the outer transaction.
    """
    connection = _test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user(db_session: Session) -> User:
    """A persisted (within the rolled-back transaction) application user."""
    u = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", display_name="Test User")
    db_session.add(u)
    db_session.flush()
    return u
