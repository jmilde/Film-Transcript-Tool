from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# The worker connects over the direct/session connection (port 5432), which
# supports the session-scoped locking (FOR UPDATE SKIP LOCKED) the queue needs.
worker_engine = create_engine(get_settings().database_url_worker, pool_pre_ping=True)
WorkerSessionLocal = sessionmaker(bind=worker_engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
