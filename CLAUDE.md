# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository contains the `/docs` specification plus an implemented Python **backend** in `backend/` (FastAPI API + a Postgres-backed worker, SQLAlchemy models, Alembic migrations). Implementation follows the phased checklist in `TODO.md` — read it for what is done and what is next. The React **frontend** does not exist yet (it is a later phase). When implementing, check `docs/` first — it is the source of truth for what a feature must do — then follow the existing backend patterns and the rules in `backend/CLAUDE.md`.

## Commands

The Python backend lives in `backend/` and uses `uv` (Python 3.12+, per `.python-version` and `backend/pyproject.toml`). A repo-root **`Makefile`** wraps the common developer commands; every target `cd`s into `backend/` and runs `uv` there, so run them from the repo root:

- `make help` — list all targets
- `make test` — run the test suite **without** integration tests (no network/credentials needed)
- `make test-all` — run **every** test, including live integration tests (needs real credentials in `backend/.env`)
- `make test-integration` — run only the live integration tests
- `make lint` / `make lint-fix` — ruff lint check / auto-fix
- `make format` / `make format-check` — ruff format in place / check only
- `make typecheck` — `mypy --strict`
- `make check` — full **offline** quality gate (lint + format-check + typecheck + `test`); use this before committing
- `make check-all` — same gate but with integration tests included
- `make install` — sync dependencies (incl. dev group)

The underlying tools (`pytest`, `ruff`, `mypy`) are declared in `backend/pyproject.toml`; to invoke one directly, `cd backend` first (e.g. `cd backend && uv run pytest -k tokens`). Add a dependency with `cd backend && uv add <package>`.

## Git workflow

Never commit directly to `main`. Do all new development on a feature branch, and open a PR when the work is ready.

## Documentation is the spec

`/docs` contains the numbered functional/technical specification for the whole system (product spec, user workflows, architecture, database, transcript model, processing pipeline, backend API, frontend, export). Read the relevant doc before implementing in that area — these files define required behavior (MUST/SHOULD/MAY) rather than describing existing code:

| Document | Covers |
|-----------|-------------|
| `docs/100_product_spec.md` | Functional requirements (projects, folders, videos, speakers, transcripts, editing, translation, comments, search, export, auth) |
| `docs/200_user_workflow.md` | End-to-end user workflows, independent of implementation |
| `docs/300_architecture.md` | System components and their responsibilities |
| `docs/400_database.md` | Relational data model and field definitions |
| `docs/500_transcript_model.md` | Transcript editing model (currently empty — not yet written) |
| `docs/600_processing_pipeline.md` | Async video processing pipeline and job states |
| `docs/700_backend_api.md` | REST API surface (routes, request/response shapes) |
| `docs/800_frontend.md` | Frontend structure and UI behavior |
| `docs/900_export.md` | Markdown/SRT export formats and rules |

## Architecture (as specified)

The target architecture, per `docs/300_architecture.md`:

```
Frontend (React/TS/Vite/Tailwind)
   |
Backend API (FastAPI/SQLAlchemy/Pydantic)
   |
   -------------------------
   |           |           |
Database   Storage      Worker
(Postgres) (local FS,   (polls Postgres-backed
 via Supabase abstraction) job queue, FFmpeg/Deepgram calls)
```

Key rules that constrain future implementation:

- **Frontend** never touches the database or media files directly, and holds no processing business logic — it only talks to the backend API. Server state (projects, videos, transcripts, comments) must be kept separate from local UI state (selection, panel layout, playback prefs).
- **Backend** owns auth checks, authorization (evaluated at the project level), validation, and DB transactions; it never runs long-running work inline in a request.
- **Long-running work** (proxy generation, waveform generation, transcription, translation, exports) runs only in the **worker**, never inside an API request. Version 1 uses a Postgres-backed job queue — workers poll and claim jobs via row locking, no separate broker.
- **Storage** is abstracted: the DB stores storage identifiers, never absolute filesystem paths or provider-specific URLs, so local filesystem storage can later be swapped for Supabase Storage/S3.
- **Deepgram** (transcription + diarization + word timestamps) and future translation providers are accessed through an abstraction layer — provider-specific response shapes must never leak into the normalized transcript model or to the frontend. Raw provider responses are stored separately from the normalized model for debugging/reprocessing.
- **Auth** is delegated entirely to Supabase; the backend consumes the authenticated identity, it doesn't implement its own auth.

## Data model essentials (`docs/400_database.md`)

- Hierarchy: `User` –(membership)– `Project` → `Folder` (unlimited self-nesting via `parent_folder_id`) → `Video` → `VideoAsset` (original/proxy/waveform/thumbnail) + `Speaker` + `Transcript` (original or translation, one per language) → `Segment` → `Token`.
- **Tokens are the smallest editable unit.** A token keeps both `original_text` and `edited_text` (displayed text is `edited_text` if present, else `original_text`); deletion is a soft `is_deleted` flag — nothing is destructively removed. Merges/splits create replacement tokens while preserving the timing of the original range.
- Editing one transcript (e.g. a translation) must never mutate another transcript (e.g. the original) — translations are independently stored and regeneratable.
- `ProcessingJob` rows are the queue itself (pending → running → completed/failed), not just status tracking — this is what workers poll and lock.
- Binary media (original/proxy video, waveforms) is never stored in Postgres — only `storage_path` identifiers pointing into the storage abstraction.

## Conventions to preserve when implementing

- Non-destructive editing throughout: never hard-delete tokens, always preserve original transcription text/original video files alongside edits.
- Every editable/user-owned row records `created_by`/`created_at`/`updated_by`/`updated_at`.
- REST resources are nested/flat per `docs/700_backend_api.md` (e.g. `/folders/{folder_id}/videos`, `/tokens/{token_id}`, `/tokens/merge`) — follow existing route shapes there rather than inventing new ones when extending the API.
