# Film Transcript Tool — Implementation TODO

Persistent, git-tracked task checklist mirroring `/Users/jan/.claude/plans/okay-how-would-we-dreamy-squirrel.md` (the design record — read it for full context/rationale). Any agent picking up this repo should check the boxes below in order and pick up at the first unchecked item. Check items off (edit this file and commit) as they're completed — don't just remember it.

Three rules apply to every phase, not just some:
- **Fully typed Python.** Every function/method/module-level variable is annotated; `uv run mypy app` must pass at the end of every phase.
- **Linted and formatted.** `uv run ruff check .` and `uv run ruff format --check .` must pass at the end of every phase.
- **Test-driven development.** Write tests first (they should fail against no implementation), then implement until green, then run the phase's manual verification. Every phase ends with green `uv run pytest` + `uv run mypy app` + `uv run ruff check .`.

Confirmed decisions: backend-first; real Supabase (Postgres + Auth) from day one, no stubs; single repo `/backend` + `/frontend`, worker is a process inside `backend`, not a separate package; real FFmpeg + real Deepgram from the start; folder/video delete **cascades**; translation provider is **DeepL**.

Schema additions beyond the literal docs (flagged in the plan, not silent): `projects.archived_at`, `transcript_tokens.position`, `transcripts.provider_raw_response`, `processing_jobs.result`.

Search uses Postgres full-text search (`tsvector` generated columns + GIN indexes) rather than an external search service — `tsvector` stores a preprocessed, stemmed, indexable form of the text so `@@ plainto_tsquery(...)` lookups are fast and rankable via `ts_rank`, with Postgres maintaining it automatically (`GENERATED ALWAYS AS ... STORED`), no app-side sync code.

---

## Phase 0 — Project scaffolding, typing, and test harness
- [x] Fresh `uv init` at `backend/`; retire root stub `main.py`/`pyproject.toml` (no root stub existed; none to retire)
- [x] Add deps + dev deps (fastapi, uvicorn, sqlalchemy, alembic, psycopg[binary], pydantic, pydantic-settings, python-multipart, PyJWT, cryptography, httpx; dev: pytest, pytest-asyncio, mypy, ruff)
- [x] Configure `mypy --strict` in `pyproject.toml`
- [x] Configure ruff in `pyproject.toml` (default rules + `I` isort + `UP` pyupgrade)
- [x] `app/config.py`: typed Settings (DATABASE_URL, DATABASE_URL_WORKER, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, DEEPGRAM_API_KEY, DEEPL_API_KEY, STORAGE_ROOT)
- [x] `.env.example`
- [x] `app/main.py`: FastAPI app factory + `GET /health`
- [x] `tests/conftest.py`: `client` fixture (DB transaction-rollback + `auth_headers` fixtures deferred to Phase 1/2 — no `db/session.py` or auth module exists yet to build them against)
- [x] `tests/integration/test_health.py` written first, then implementation
- [x] Verify: `uv run pytest` green, `uv run mypy app` clean, `uv run ruff check .` clean, manual curl `/health`

## Phase 1 — Core hierarchy schema
- [x] `db/base.py` (Base + naming convention + TimestampMixin/OwnedMixin + CreatedAtMixin/UUIDPrimaryKeyMixin), `db/session.py`
- [x] Models: User, Project (+archived_at), ProjectMembership, Folder (self-referential), Video, VideoAsset
- [x] `alembic init`; wire `env.py` to Base.metadata + Settings (worker URL for DDL); migration 0001 (`653ca282cee5`)
- [x] Tests first: model construction (`tests/unit/test_models.py`), migration/table-exists check (`tests/integration/test_migrations.py`); `conftest.py` gained transaction-rollback `db_session` + `user` fixtures and `get_db`-override `client`
- [x] Verify: `alembic upgrade head` against real Supabase (6 tables created), pytest (8 passed), mypy clean, ruff clean, `alembic downgrade -1` reverses cleanly then re-upgraded to head

## Phase 2 — Storage, auth, Projects/Folders CRUD
- [ ] `storage/base.py` (Storage protocol), `storage/local.py` (path-traversal guarded)
- [ ] `core/auth.py`: `verify_jwt`, `get_current_user` (upserts User)
- [ ] `core/errors.py`: typed exceptions → `{"error":{"code","message"}}`
- [ ] `api/deps.py`: get_db, get_current_user, require_project_member
- [ ] `schemas/project.py`, `schemas/folder.py`
- [ ] Tests first: storage, auth, projects CRUD, folders CRUD (nested, move-cycle guard, **cascade delete**, non-member 403)
- [ ] `api/routes/projects.py`, `api/routes/folders.py`
- [ ] Verify: pytest, mypy, ruff check, manual curl with real bearer token

## Phase 3 — Job queue + worker skeleton
- [ ] `models/job.py` (ProcessingJob + result JSONB, JobType/JobStatus enums); migration 0002
- [ ] `worker/claim.py` (SELECT...FOR UPDATE SKIP LOCKED)
- [ ] `worker/runner.py` (poll loop, typed handler registry)
- [ ] `worker/handlers/noop.py`
- [ ] `api/routes/videos.py` (upload, mp4/mov validation, enqueues extract_metadata, **cascade delete**)
- [ ] `api/routes/jobs.py` (get, retry)
- [ ] `services/pipeline.py` (stage order map)
- [ ] Tests first: claim race (two connections), noop job completes, upload valid/invalid, cascade delete
- [ ] Verify: pytest, mypy, ruff check, real worker process + concurrent workers no double-claim, real upload

## Phase 4 — Media pipeline (FFmpeg)
- [ ] `media/ffmpeg.py`: probe, generate_proxy, generate_waveform, extract_audio (typed arg builders)
- [ ] `worker/handlers/{metadata,proxy,waveform,audio_extract}.py` (idempotent, skip-if-done)
- [ ] Tests first: pure arg-builder tests, real ffmpeg run against a tiny sample clip
- [ ] Verify: pytest, mypy, ruff check, real upload through all 4 stages, retry resumes only failed stage

## Phase 5 — Deepgram transcription + transcript population
- [ ] `transcription/base.py`, `transcription/deepgram.py`, `transcription/normalize.py`
- [ ] `services/transcripts.py` (builds Transcript/Speaker/Segment/Token)
- [ ] `worker/handlers/transcribe.py`, `api/routes/transcripts.py`, `api/routes/speakers.py`
- [ ] Models: Speaker, Transcript (+provider_raw_response), TranscriptSegment, TranscriptToken (+position); migration 0003
- [ ] Tests first: normalize() against saved real Deepgram JSON fixture, transcripts service, routes
- [ ] Verify: pytest, mypy, ruff check, real clip → real Deepgram call → transcript populated, speaker rename propagates

## Phase 6 — Token editing
- [ ] `services/tokens.py`: edit/delete/merge/split, typed errors (e.g. TokenMergeInvalidSegmentError)
- [ ] `api/routes/tokens.py`: PATCH, DELETE, merge, split
- [ ] `GET /transcripts/{id}` excludes deleted tokens
- [ ] Tests first (highest-value TDD phase): merge same-segment, merge cross-segment rejected, delete excluded-but-persisted, split interpolated timestamps, edit only changes text
- [ ] Verify: pytest, mypy, ruff check, manual curl each op

## Phase 7 — Comments
- [ ] Models: Comment, CommentRange, CommentReply; migration 0004
- [ ] `api/routes/comments.py`: create, list (computed timecodes), reply, resolve
- [ ] Tests first: create/list/reply/resolve, cross-transcript rejected
- [ ] Verify: pytest, mypy, ruff check, manual curl flow

## Phase 8 — Search (Postgres FTS)
- [ ] Migration 0005: generated tsvector columns + GIN indexes (tokens, speakers, comments)
- [ ] `api/routes/search.py`: three scoped queries, ts_rank merge
- [ ] Tests first: known text per source, stemmed match
- [ ] Verify: pytest, mypy, ruff check, manual curl search

## Phase 9 — Export (Markdown, SRT)
- [ ] `models/export.py` (no status field); migration 0006
- [ ] `export/markdown.py`, `export/srt.py` (pure render functions)
- [ ] `worker/handlers/export.py`, `api/routes/exports.py` (404 until job completes)
- [ ] Tests first: exact output strings (edit wins, deleted excluded, SRT `HH:MM:SS,mmm`), job→export flow
- [ ] Verify: pytest, mypy, ruff check, real export end-to-end, diff output

## Phase 10 — Translation (DeepL)
- [ ] `translation/base.py`, `translation/deepl.py`
- [ ] `worker/handlers/translate.py` (new Transcript(type=translation), interpolated timestamps)
- [ ] `api/routes/transcripts.py`: POST .../translate
- [ ] Tests first: saved real DeepL response fixture
- [ ] Verify: pytest, mypy, ruff check, real translation, original untouched

## Phase 11 — Frontend placeholder
- [ ] Vite React-TS + Tailwind + TanStack Query + React Router scaffold in `frontend/`
- [ ] Typed API client generated from `/openapi.json` via openapi-typescript
- [ ] Minimal project-list view with Supabase JS sign-in
- [ ] Verify: `npm run build` clean, manual click-through

## Phase 12 — Docker Compose
- [ ] `Dockerfile.backend` (installs ffmpeg), shared by backend+worker (CMD override)
- [ ] `Dockerfile.frontend`
- [ ] `docker-compose.yml`: backend, worker, frontend — no database service (real Supabase used directly)
- [ ] Verify: `docker compose up`, `/health` responds, full upload→process→transcript flow works
