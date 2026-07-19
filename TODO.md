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
- [x] `transcription/base.py` (TranscriptionProvider protocol), `transcription/deepgram.py` (real REST call, `DeepgramError`), `transcription/normalize.py` (pure Deepgram→normalized; prefers `utterances`, falls back to speaker-grouped words); `transcription/factory.py` (get-provider indirection so the handler is testable without a live call)
- [x] `services/transcripts.py` (`create_transcript_from_normalized`: builds Transcript/Speaker/Segment/Token, get-or-creates video-scoped speakers by provider id, Decimal fractional positions, raw response only stored for originals)
- [x] `worker/handlers/transcribe.py` (idempotent: skips if an original transcript exists; sends extracted audio, not the video) + registered in runner `HANDLERS`; `api/routes/transcripts.py` (list + get, **deleted tokens excluded**, display `text` = edited∨original), `api/routes/speakers.py` (list + rename); `require_transcript_access`/`require_speaker_access` deps
- [x] Models: Speaker (+denormalized project_id), Transcript (+project_id, +provider_raw_response, TranscriptType enum), TranscriptSegment (+Numeric position), TranscriptToken (+project_id, +Numeric position, is_deleted); migration 0004 (`6f8a0f577408`) — note: 0003 was consumed by the earlier denormalize migration, so Phase 5 is 0004
- [x] Tests first (mirroring source): `tests/transcription/test_normalize.py` (saved Deepgram JSON fixture: utterance segmentation, word-grouping fallback, punctuated_word, empty results), `tests/services/test_transcripts.py` (segments/tokens/speakers, speaker reuse across transcripts, translation stores no raw), `tests/worker/handlers/test_transcribe.py` (fake provider → populate, idempotency, missing-audio raises), `tests/api/routes/test_{transcripts,speakers}.py` (list/get, edited-text display, deleted excluded, rename propagation, non-member 403), plus model construction in `tests/models/test_models.py`
- [x] Live Deepgram integration test: `tests/transcription/test_deepgram_integration.py` drives the real `DeepgramTranscriptionProvider` against a tiny checked-in speech clip (`tests/transcription/fixtures/snippet.wav`) → `normalize()`, asserting real words/language back. Marked `integration` (new pytest marker; deselect with `-m 'not integration'`) and skips when `DEEPGRAM_API_KEY` is unset/`placeholder`. Real key lives in gitignored `.env`.
- [x] Verify: pytest (115 passed, incl. the live Deepgram call), mypy clean, ruff check + format clean; `alembic upgrade head`/`downgrade -1` round-trip on real Supabase; **real speech clip driven end-to-end against real Supabase + real ffmpeg — all 4 media stages completed**; **live Deepgram transcription now verified** via the integration test (a real key is provisioned in `.env`), which returns real diarized words that `normalize()` maps correctly. Speaker-rename propagation is covered by `test_speakers.py`.

## Phase 6 — Token editing
- [x] `services/tokens.py`: edit/delete/merge/split, typed errors (`TokenMergeInvalidSegmentError` subclasses `BadRequestError` → renders `TOKEN_MERGE_CROSS_SEGMENT`). Non-destructive: edit overlays `edited_text` (timing/`original_text` untouched), delete sets `is_deleted`, merge/split soft-delete originals and create replacements with fractional `NUMERIC` positions so order stays stable; split interpolates timing evenly across the original range
- [x] `api/routes/tokens.py`: PATCH (edit text, nullable to clear), DELETE (soft), POST `/tokens/merge`, POST `/tokens/{id}/split`. Authz: `require_token_access` dep for the path-id ops; `require_merge_context` dep is the sole body consumer for merge (loads + authorizes all tokens, one project) so the route keeps a single body param
- [x] `GET /transcripts/{id}` excludes deleted tokens (already implemented in Phase 5, re-verified by Phase 6 delete/merge/split API tests)
- [x] Tests first (highest-value TDD phase): `tests/services/test_tokens.py` (edit-only-changes-text, clear edit, soft delete, merge same-segment/cross-segment rejected/<2 rejected, split interpolated timestamps/<2 rejected/positions between neighbours) + `tests/api/routes/test_tokens.py` (edit display, delete excluded-but-persisted, merge, cross-segment 400, split, non-member 403)
- [x] Verify: pytest (130 passed, 1 integration deselected), mypy clean (105 files), ruff check + format clean; no migration (Phase 6 adds no schema); app boots with all four token routes in the OpenAPI schema. Authenticated curl deferred as in prior phases (needs an interactive Supabase token; the ops are covered end-to-end by TestClient tests against the real rolled-back DB)

## Phase 7 — Comments
- [x] Models: Comment (+denormalized project_id, resolved bool, OwnedMixin), CommentRange (start/end token FKs, immutable — CreatedAtMixin only), CommentReply (immutable, created_by + CreatedAtMixin, no update columns per docs §15); migration 0005 (`3caf3f9ffb4d`) — note: docs said "0004" but 0004 was consumed by Phase 5 transcripts, so Comments is 0005. In/out timecodes are **not stored** — derived from the range's `start_token.start_time`/`end_token.end_time` on read so they follow token edits
- [x] `services/comments.py`: `create_comment` (validates both tokens exist and belong to the path transcript → `CommentRangeInvalidError`/`COMMENT_RANGE_INVALID` on a cross-transcript range), `add_reply`, `set_resolved`; `api/routes/comments.py`: POST `/transcripts/{id}/comments`, GET `/transcripts/{id}/comments` (computed `in_time`/`out_time`, nested replies), POST `/comments/{id}/replies`, PATCH `/comments/{id}` (resolve). `require_comment_access` dep (O(1) via denormalized project_id)
- [x] Tests first (mirroring source): `tests/services/test_comments.py` (range built, cross-transcript rejected, reply stored, resolve toggles) + `tests/api/routes/test_comments.py` (create+list with computed timecodes 0.0/0.8, reply, resolve, cross-transcript 400 `COMMENT_RANGE_INVALID`, non-member 403)
- [x] Verify: pytest (139 passed, 1 integration deselected), mypy clean (111 files), ruff check + format clean; `alembic upgrade head`/`downgrade -1`/re-upgrade round-trip on real Supabase; all four comment routes present in the OpenAPI schema. Authenticated curl deferred as in prior phases (needs an interactive Supabase token; the flow is covered end-to-end by TestClient tests against the real rolled-back DB)

## Phase 8 — Search (Postgres FTS)
- [x] Migration **0006** (`d4c468bbac92`): stored generated `tsvector` columns + GIN indexes on `transcript_tokens` (`coalesce(edited_text, original_text)`), `speakers` (`coalesce(name, '')`), `comments` (`text`), all English config so matching is stemmed. Numbered 0006, not 0005 — 0005 was consumed by Phase 7 comments. Autogenerated (Alembic detected all three columns + GIN indexes), ruff-formatted, round-tripped upgrade/downgrade/re-upgrade on real Supabase
- [x] `services/search.py` `search_project()` + `api/routes/search.py` `GET /projects/{id}/search?q=`: three project-scoped queries (transcript tokens filtered to `is_deleted = false`; speakers; comments joined to their range's start token) matched via `@@ plainto_tsquery`, merged and ranked together by `ts_rank` (descending). Each `SearchResult` carries `kind` (transcript/speaker/comment), `video_id`, and a seekable `start_time` (`None` for video-level speaker hits). Authz reuses `require_project_member` (403 for non-members)
- [x] Tests first (mirroring source): `tests/services/test_search.py` (transcript-text match with seekable start_time, deleted tokens excluded, stemmed speaker match `interview`→`Interviewer`, stemmed comment match `climates`→`climate`, project scoping) + `tests/api/routes/test_search.py` (all three sources merged, rank-descending order, non-member 403)
- [x] Verify: pytest (147 passed, 1 integration deselected), mypy clean (116 files), ruff check + format clean; migration round-trip on real Supabase; `/projects/{project_id}/search` present in the OpenAPI schema. Manual curl deferred as in prior phases (needs an interactive Supabase token; covered end-to-end by TestClient tests against the real rolled-back DB)

## Phase 9 — Export (Markdown, SRT)
- [x] `models/export.py` `Export` (id, transcript_id, denormalized project_id for O(1) authz, type=markdown/srt, nullable `storage_path`, created_by/created_at — **no status field**; status lives on the driving `ProcessingJob`, null `storage_path` == "not rendered yet"). Migration **0007** (`2cd6af4f89bd`), not 0006 — 0006 was consumed by Phase 8 search; autogenerated, modern-typing + ruff-formatted, round-tripped upgrade/downgrade/re-upgrade on real Supabase
- [x] `export/markdown.py` + `export/srt.py` are pure functions over `export/document.py` dataclasses (`ExportDocument`/`ExportSegment`/`ExportToken`) — no DB/ORM knowledge. Markdown: `# video`, `_Language: …_`, per-speaker `## Speaker:` headings emitted only on speaker change, `[HH:MM:SS - HH:MM:SS]` + text. SRT: 1-based blocks, `HH:MM:SS,mmm --> HH:MM:SS,mmm` (ms rounded from token times), one block per segment. `services/exports.py` `build_export_document()` bridges the relational model → dataclasses (edited-text overlays original, deleted tokens excluded, fully-deleted segments dropped, speaker name falls back to provider identifier) and `render_export()`/`export_key()` dispatch by type
- [x] `worker/handlers/export.py` `handle_export` (reads target export id from `job.result`, renders current transcript, writes `exports/{id}.{md,srt}` to storage, stamps `storage_path`; registered in `runner.HANDLERS` under `JobType.EXPORT`, not in the upload pipeline) + `api/routes/exports.py` (`POST /transcripts/{id}/exports` creates Export row + pending EXPORT job carrying `{export_id}`; `GET /exports/{id}` → `ready` flag; `GET /exports/{id}/content` → **404 until `storage_path` set**, else the file with `text/markdown`/`application/x-subrip`). New `require_export_access` dep
- [x] Tests first (mirroring source): `tests/export/test_markdown.py` + `test_srt.py` (exact output strings incl. hour-rollover and SRT `,mmm`), `tests/services/test_exports.py` (edit wins, deleted token & fully-deleted segment excluded, speaker name resolution/fallback, `export_key` extensions), `tests/worker/handlers/test_export.py` (handler writes real file + `run_once` drives EXPORT → completed with `{export_id, storage_path}` result), `tests/api/routes/test_exports.py` (full lifecycle: create → not-ready 404 → worker → ready + exact markdown/SRT bytes; non-member 403; unknown id 404)
- [x] Verify: `make check` green (165 passed, 1 integration deselected; ruff check + format-check + mypy --strict all clean); migration round-trip on real Supabase; real export end-to-end exercised through the worker writing/reading actual files in the route + handler tests (exact-byte assertions stand in for a manual diff)

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
