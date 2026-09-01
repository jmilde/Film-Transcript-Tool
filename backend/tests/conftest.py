import uuid
from collections.abc import Callable, Iterator
from urllib.parse import urlsplit

import pytest
from app.config import get_settings
from app.core.auth import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.user import User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Tests talk to a local Dockerized Postgres over the worker/session connection
# (the `db-test` container, port 5443 — see repo-root docker-compose.yml and
# Makefile), which supports holding a transaction open for the whole test.
_ALLOWED_TEST_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}


def pytest_configure(config: pytest.Config) -> None:
    """Hard-abort before any test runs if DATABASE_URL_WORKER isn't local.

    Tests commit real rows outside the rollback fixture (e.g. `committed_token`
    in tests/services/test_tokens.py) and `make test` runs `alembic upgrade
    head` against this URL. If it resolved to a hosted database — most
    dangerously the real Supabase Postgres — a test run could wipe or corrupt
    real data. `make test`/`test-all`/`test-integration` already bind this to
    the local `db-test` container, but this check protects against invoking
    pytest directly with a stale `backend/.env` pointed at Supabase.
    """
    del config  # required by the pytest_configure hook signature, unused here
    url = get_settings().database_url_worker
    host = urlsplit(url).hostname
    if host not in _ALLOWED_TEST_DB_HOSTS:
        raise pytest.UsageError(
            f"Refusing to run tests: DATABASE_URL_WORKER resolves to host "
            f"{host!r}, not localhost. Tests commit real data and run "
            f"migrations against this database — pointing it at a remote/"
            f"hosted Postgres (e.g. Supabase) risks destroying real data. "
            f"Run `make test` (binds this to the local Docker db-test "
            f"container on port 5443) instead of invoking pytest directly, "
            f"or otherwise point DATABASE_URL_WORKER at a local Postgres."
        )


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


def _make_user(db_session: Session) -> User:
    u = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", display_name="Test User")
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def user(db_session: Session) -> User:
    """A persisted (within the rolled-back transaction) application user."""
    return _make_user(db_session)


@pytest.fixture
def other_user(db_session: Session) -> User:
    """A second application user, for cross-user authorization tests."""
    return _make_user(db_session)


@pytest.fixture
def app_client(db_session: Session) -> Callable[[User], TestClient]:
    """Factory building a TestClient authenticated as a given user.

    Both `get_db` and `get_current_user` are overridden so requests run against
    the rolled-back test transaction as the supplied user, with no real JWT.
    """

    def _make(current_user: User) -> TestClient:
        app = create_app()
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: current_user
        return TestClient(app)

    return _make


@pytest.fixture
def auth_client(app_client: Callable[[User], TestClient], user: User) -> TestClient:
    """A TestClient authenticated as the default `user` fixture."""
    return app_client(user)
