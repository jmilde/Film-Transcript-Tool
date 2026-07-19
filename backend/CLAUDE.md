# Backend conventions

Guidance specific to the `backend/` package. The repo-root `CLAUDE.md` and `docs/` still apply; this file adds backend-only rules.

## Imports

- **No `__all__`, and no re-export hubs.** Import every name from the module that defines it — e.g. `from app.models.user import User`, `from app.core.auth import get_current_user`, `from app.db.session import get_db`. Do not import through an aggregating package (`from app.models import User`) or add `__all__` to make such imports "explicit". `mypy --strict` enforces this via `no_implicit_reexport`; a package that re-exports would need `__all__`, which we don't want.
- `app/models/__init__.py` is the one exception to "packages don't re-export": it imports the model *modules* (not their classes) purely so every mapped class registers on `Base.metadata` for Alembic autogenerate. It exposes no names.

## Authorization / data model

- Authorization is evaluated at the **project** level via `ProjectMembership`.
- **Every access-controlled row carries a denormalized `project_id`** (`folders`, `videos`, `processing_jobs`, and — as they're added — `transcripts`, `transcript_tokens`, `comments`, `exports`, `speakers`). This keeps `require_*_access` a uniform two-step check — *fetch the row (404 if missing) → `_require_membership(db, row.project_id, user)` (403 if not a member)* — instead of walking `row → video → folder → project` with a chain of queries. Denormalizing is safe because a row never changes project (cross-project moves are forbidden). Set `project_id` at creation time; never leave a real row's project unset.

## Tests

- **The test tree mirrors the source tree.** A test for `app/<pkg>/<mod>.py` lives at `tests/<pkg>/test_<mod>.py` (e.g. `app/storage/local.py` → `tests/storage/test_local.py`, `app/api/routes/projects.py` → `tests/api/routes/test_projects.py`). There is no `unit/`/`integration/` split — the module path already says what each test covers.
- Tests run against the real Supabase Postgres. The `db_session` fixture wraps each test in a transaction that is always rolled back; prefer it. The one place that needs real committed data across connections (the `FOR UPDATE SKIP LOCKED` claim race) uses its own engine and cleans up explicitly.

## Typing, lint, format

Every phase ends green on `uv run pytest`, `uv run mypy app tests` (strict), `uv run ruff check .`, and `uv run ruff format --check .`.
