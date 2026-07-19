# Film Transcript Tool — Implementation TODO

Persistent, git-tracked task checklist mirroring `/Users/jan/.claude/plans/okay-how-would-we-dreamy-squirrel.md` (the design record — read it for full context/rationale). Any agent picking up this repo should check the boxes below in order and pick up at the first unchecked item. Check items off (edit this file and commit) as they're completed — don't just remember it.

Three rules apply to every phase, not just some:
- **Fully typed Python.** Every function/method/module-level variable is annotated; `uv run mypy app` must pass at the end of every phase.
- **Linted and formatted.** `uv run ruff check .` and `uv run ruff format --check .` must pass at the end of every phase.
- **Test-driven development.** Write tests first (they should fail against no implementation), then implement until green, then run the phase's manual verification. Every phase ends with green `uv run pytest` + `uv run mypy app` + `uv run ruff check .`.
- **Test tree mirrors the source tree.** A test for `app/<pkg>/<mod>.py` lives at `tests/<pkg>/test_<mod>.py` (e.g. `app/storage/local.py` → `tests/storage/test_local.py`, `app/api/routes/projects.py` → `tests/api/routes/test_projects.py`). No `unit/`/`integration/` split — the module path already says what each test covers; pure-vs-DB is evident from the module.
- **Explicit imports, no `__all__`.** Import every name from its defining module (`from app.models.user import User`), never through an aggregating package. See `backend/CLAUDE.md`.

Confirmed decisions: backend-first; real Supabase (Postgres + Auth) from day one, no stubs; single repo `/backend` + `/frontend`, worker is a process inside `backend`, not a separate package; real FFmpeg + real Deepgram from the start; folder/video delete **cascades**; translation provider is **DeepL**.

Schema additions beyond the literal docs (flagged in the plan, not silent): `projects.archived_at`, `transcript_tokens.position`, `transcripts.provider_raw_response`, `processing_jobs.result`. Plus a **denormalized `project_id` on every access-controlled row** (`videos`, `processing_jobs`, and later `transcripts`/`transcript_tokens`/`comments`/`exports`/`speakers`) so authorization is a single membership lookup instead of a tree walk — see `backend/CLAUDE.md`.

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
- [x] `tests/test_main.py` (health) written first, then implementation
- [x] Verify: `uv run pytest` green, `uv run mypy app` clean, `uv run ruff check .` clean, manual curl `/health`

## Phase 1 — Core hierarchy schema
- [x] `db/base.py` (Base + naming convention + TimestampMixin/OwnedMixin + CreatedAtMixin/UUIDPrimaryKeyMixin), `db/session.py`
- [x] Models: User, Project (+archived_at), ProjectMembership, Folder (self-referential), Video, VideoAsset
- [x] `alembic init`; wire `env.py` to Base.metadata + Settings (worker URL for DDL); migration 0001 (`653ca282cee5`)
- [x] Tests first: model construction (`tests/models/test_models.py`), migration/table-exists check (`tests/db/test_migrations.py`); `conftest.py` gained transaction-rollback `db_session` + `user` fixtures and `get_db`-override `client`
- [x] Verify: `alembic upgrade head` against real Supabase (6 tables created), pytest (8 passed), mypy clean, ruff clean, `alembic downgrade -1` reverses cleanly then re-upgraded to head

## Phase 2 — Storage, auth, Projects/Folders CRUD
- [x] `storage/base.py` (Storage protocol), `storage/local.py` (path-traversal guarded)
- [x] `core/auth.py`: `verify_jwt` (JWKS/ES256+RS256, not HS256 — config uses `supabase_jwks_url`), `get_current_user` (upserts User)
- [x] `core/errors.py`: typed `AppError` hierarchy + handler → `{"error":{"code","message"}}`
- [x] `api/deps.py`: get_db, get_current_user, require_project_member (+ require_folder_access)
- [x] `schemas/project.py`, `schemas/folder.py`
- [x] Tests first (mirroring source): `tests/storage/test_local.py`, `tests/core/test_auth.py` (ES256-signed fixtures + monkeypatched signing key), `tests/core/test_errors.py`, `tests/api/test_deps.py` (authorization), `tests/api/routes/test_projects.py` + `test_folders.py` (nested, foreign-parent reject, move-into-self/descendant guard, **cascade delete**, non-member 403); conftest gained `other_user` + `app_client` factory + `auth_client`
- [x] `api/routes/projects.py`, `api/routes/folders.py`
- [x] Verify: pytest (38 passed), mypy clean, ruff check + format clean; manual smoke of running app (`/health` 200, no-token/bad-token → 401 envelope). Curl with a *real* minted Supabase bearer token deferred — needs interactive Supabase login to mint a JWT; authenticated CRUD is covered by integration tests against the real (rolled-back) DB and JWT verification is unit-tested with real ES256 signing.

## Phase 3 — Job queue + worker skeleton
- [x] `models/job.py` (ProcessingJob + result JSONB, video_id nullable, JobType/JobStatus enums); migration 0002 (`e4354408f955`)
- [x] `worker/claim.py` (`claim_next_job`: SELECT…FOR UPDATE SKIP LOCKED → running)
- [x] `worker/runner.py` (`run_once` + `run_forever` poll loop, typed `HANDLERS` registry, commit-after-claim releases lock; `WorkerSessionLocal` on the 5432 connection)
- [x] `worker/handlers/noop.py`
- [x] `api/routes/videos.py` (upload, mp4/mov validation, stores original + `VideoAsset`, enqueues `extract_metadata`, get, **cascade delete** + storage cleanup); `get_storage`/`require_video_access` deps
- [x] `api/routes/jobs.py` (get, retry failed→pending); `require_job_access` dep
- [x] `services/pipeline.py` (`UPLOAD_PIPELINE` order map, `FIRST_STAGE`, `next_stage`)
- [x] Tests first (mirroring source): `tests/worker/test_claim.py` (SKIP LOCKED race, two real connections, explicit cleanup), `tests/worker/test_runner.py` (noop completes, failing handler → failed), `tests/services/test_pipeline.py`, `tests/api/routes/test_videos.py` (valid/invalid upload, cascade delete, non-member), `tests/api/routes/test_jobs.py` (get/retry/403/404)
- [x] Verify: pytest (70 passed), mypy clean, ruff check + format clean; `alembic upgrade head`/`downgrade -1` round-trip on real Supabase; **two concurrent workers drained 20 real jobs, all completed, no double-claim/stuck rows**; app boots with all routes, unauth upload → 401. Real authenticated upload curl deferred (needs interactive Supabase token; upload path covered by integration tests).

## Phase 4 — Media pipeline (FFmpeg)
- [x] `media/ffmpeg.py`: probe, generate_proxy, generate_waveform, extract_audio (typed arg builders + `parse_probe`/`compute_peaks` pure helpers; `FFmpegError` on non-zero exit). `storage/factory.py` shared by API dep + worker; `worker/media.py` (input loaders + deterministic asset keys)
- [x] `worker/handlers/{metadata,proxy,waveform,audio_extract}.py` (idempotent: metadata skips if `duration` set, proxy/waveform skip if asset exists, audio skips if key exists — no audio asset type since Phase 4 adds no schema). Runner registers all four + `_enqueue_next_stage` chains the pipeline on completion (forward-only, so retry resumes only the failed stage); unregistered job type now fails with a clear message
- [x] Tests first (mirroring source): `tests/media/test_ffmpeg.py` (pure arg-builder + parse/peaks tests, real ffmpeg run against a generated sample clip), `tests/worker/handlers/test_{metadata,proxy,waveform,audio_extract}.py` (real ffmpeg via `media` fixture + tmp storage), runner chaining/unregistered-handler tests
- [x] Verify: pytest (94 passed), mypy clean, ruff check + format clean; **real upload driven end-to-end against real Supabase + real ffmpeg — all 4 media stages completed (metadata 640x480/2.0s/30fps, proxy/waveform/audio assets written), transcribe fails as expected (handler is Phase 5)**

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
