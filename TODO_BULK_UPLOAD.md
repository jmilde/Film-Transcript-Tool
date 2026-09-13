# Bulk video upload — implementation TODO

Persistent, git-tracked task checklist for bulk video upload: drag-and-drop or
folder-select multi-file upload, a persistent global status tray, duplicate
skipping, and conditional proxy generation. Read
`docs/specs/2026-09-13-bulk-video-upload-design.md` first — that's the design
and the "why"; this file is just the checklist. Mirrors the style of
`TODO_FRONTEND_OVERHAUL.md` / `TODO_FROST_RESKIN.md`.

Any agent picking this up should work top to bottom and check items off (edit
this file and commit) as they land — don't just remember it.

Ground rules, same as every other `TODO_*.md` in this repo:

- Tests-first: write/adjust a failing test, then implement.
- Backend: follow `backend/CLAUDE.md` — no schema DDL by hand (there is none
  needed here; no new columns/tables), `mypy --strict` clean, `make check`
  green before moving to frontend work that depends on it.
- Frontend: no `any` on API boundaries. After Phase 2 (the last backend
  phase), run `make openapi` (repo root) and commit the regenerated
  `frontend/src/api/schema.d.ts` before starting Phase 3. Server state
  (TanStack Query) stays separate from local UI state (zustand) — the upload
  queue is UI state (zustand); job/video data already flows through TanStack
  Query hooks.
- Every phase ends with a `Verify` step. Don't check a phase's boxes without
  having run it.
- Don't over-engineer: no subfolder-mirroring, no bulk wire format, no
  hard-reload persistence — see the spec's Non-goals before adding anything
  not listed in a phase below.

## Confirmed decisions (do not re-litigate while implementing)

From the design session — see the spec doc for the full reasoning:

- Uploads stay one file per HTTP request (existing
  `POST /folders/{folder_id}/videos`), fired concurrently client-side with a
  cap of 3 in flight. No new bulk upload wire format.
- Duplicate match key is **filename + original-asset size**, not filename
  alone (camera-default filenames collide across unrelated clips).
- Duplicates are auto-skipped and shown in the tray as skipped — no
  "upload anyway" override.
- Duplicate check happens **before** the byte transfer starts, via a
  dedicated endpoint — never upload a large file just to discard it.
- Proxy generation is skipped when `video.height <= 720` (the existing proxy
  transcode target) — falls back to the already-existing `ORIGINAL`-asset
  fallback in the serving route, no frontend change needed for this part.
- The upload tray is a global (app-shell-mounted), session-scoped store — it
  survives in-app navigation, not a hard page reload.
- One file failing (duplicate-check error, upload error, or a failed
  processing job) never blocks or cancels the rest of the batch.
- No subfolder mirroring: dropping an OS folder uploads every video inside it
  (recursively) flat into the target app folder.

## Phase 0 — Backend: batch status endpoint

- [x] Tests first in `backend/tests/api/routes/test_videos.py` (or a new
      `test_video_status.py` if that file is getting large): a new
      `GET /videos/status?ids=<uuid>,<uuid>,...` endpoint returns job status
      for each requested video, 403s/omits IDs outside the caller's project
      membership (check how existing per-video auth in `videos.py` handles
      this and mirror it — don't leak existence of videos in other
      projects), handles an empty `ids` param, handles a mix of valid/
      invalid/foreign IDs in one request.
- [x] Implement in `backend/app/api/routes/videos.py`: parse the comma-
      separated `ids` query param, reuse whatever helper already builds the
      `jobs` list on `VideoRead` (`_video_read()` or equivalent) so the shape
      matches exactly — do not reimplement job-serialization logic. Response:
      `[{video_id, status, jobs: [...]}, ...]`.
- [x] Add/extend the Pydantic response schema in `backend/app/schemas/video.py`
      (e.g. `VideoStatusRead`) rather than reusing `VideoRead` wholesale if
      the full video shape isn't needed for polling.
- [x] Verify: `make check` green.

## Phase 1 — Backend: duplicate-check endpoint

- [x] Tests first: a new
      `GET /folders/{folder_id}/videos/duplicate-check?filename=...&size=...`
      returns `{is_duplicate: true, video_id: ...}` when a video in that
      folder has matching `original_filename` **and** matching
      `VideoAsset(type=ORIGINAL).size`; returns `{is_duplicate: false,
      video_id: null}` on a filename-only collision (different size) and on
      no match at all; 404/403 on a folder the caller can't access (mirror
      existing folder-access checks elsewhere in `videos.py`/`folders.py`).
- [x] Implement in `backend/app/api/routes/videos.py` (or `folders.py`,
      whichever already owns folder-scoped video routes) — a straightforward
      join/query against `Video` + `VideoAsset`, no new model fields needed
      (`VideoAsset.size` already exists per `backend/app/models/asset.py`).
- [x] Verify: `make check` green.

## Phase 2 — Backend: conditional proxy generation

- [x] Tests first in whatever test file covers
      `backend/app/worker/handlers/proxy.py` (check for an existing
      `tests/worker/handlers/test_proxy.py` or similar): given a `Video` with
      `height <= 720`, `handle_generate_proxy` completes the job without
      creating a `PROXY` `VideoAsset`; given `height > 720`, existing
      behavior (transcode + create asset) is unchanged. Add/confirm a
      regression test that `GET /videos/{id}/proxy` still falls back to
      `ORIGINAL` when no `PROXY` asset exists (it already should — this is
      confirming the existing fallback covers the new skip case, not new
      fallback logic).
- [x] Implement the early-exit in `handle_generate_proxy`
      (`backend/app/worker/handlers/proxy.py`), reading `video.height`
      (already populated by the preceding `EXTRACT_METADATA` stage — confirm
      job ordering in `backend/app/services/pipeline.py`'s `UPLOAD_PIPELINE`
      guarantees this before relying on it).
- [x] Verify: `make check` green.

## Phase 2.5 — Regenerate OpenAPI schema

- [x] Run `make openapi` (repo root); commit the regenerated
      `frontend/src/api/schema.d.ts` alongside (or immediately before)
      Phase 3.

## Phase 3 — Frontend: global upload queue store

- [x] New `frontend/src/store/uploadQueue.ts` (zustand): entry shape
      `{localId, folderId, fileName, fileSize, status: 'queued' | 'checking'
      | 'skipped' | 'uploading' | 'processing' | 'ready' | 'failed', videoId?,
      jobIds?, error?}`. Mount/subscribe at the app shell level
      (`frontend/src/components/AppShell.tsx` or equivalent root layout), not
      inside `FolderPanel`, so it survives route changes.
- [x] Actions: `enqueue(files, folderId)` (dedupes by filename+size **within
      the same call** before adding entries — see spec's intra-batch race
      note), `updateStatus(localId, patch)`, `dismiss(localId)`,
      `clearCompleted()`.
- [x] Tests: store unit tests for intra-batch dedup, status transitions, and
      `clearCompleted` only removing `ready` entries.
- [x] Verify: `npm run test` green, `npm run typecheck` clean.

## Phase 4 — Frontend: enqueue entry points

- [x] `frontend/src/features/folders/FolderPanel.tsx`: extend the existing
      native drag-and-drop handling (currently only handles the app's own
      `VIDEO_DND_TYPE` payload for moving videos between folders — see
      existing DnD code in this file) to also detect OS file/folder drags by
      checking `dataTransfer.types.includes('Files')` before falling back to
      the existing internal-DnD path.
- [x] Recursively walk dropped folders via
      `DataTransferItem.webkitGetAsEntry()` (a folder drop doesn't expose
      nested files directly) to produce a flat `File[]`; filter to allowed
      video extensions client-side (mirror backend `ALLOWED_EXTENSIONS` from
      `backend/app/api/routes/videos.py`) before calling `enqueue`.
- [x] Add a "Select folder" button next to the existing single-file upload
      button, using `<input type="file" webkitdirectory multiple>`; Firefox
      (no `webkitdirectory` support) falls back to plain multi-file select —
      verify this degrades gracefully rather than erroring.
- [x] Tests: RTL tests for OS-file-drop detection (mock `dataTransfer.types`)
      and folder-entry enumeration (mock `webkitGetAsEntry`); confirm
      existing internal video-move DnD tests still pass unchanged.
- [x] Verify: `npm run test` green.

## Phase 5 — Frontend: queue runner

- [ ] New hook/module (e.g. `frontend/src/features/folders/useUploadRunner.ts`)
      draining `queued` entries from the Phase 3 store with a concurrency cap
      of 3: `queued → checking` (call Phase 1's duplicate-check endpoint;
      match → `skipped`; no match → continue) `→ uploading` (POST via the
      existing `useUploadVideo`/equivalent in `frontend/src/api/hooks/useVideos.ts`;
      success → `processing` with `videoId`; failure → `failed` with a retry
      action that re-invokes just this entry).
- [ ] Generalize `useVideoProcessing` (`frontend/src/api/hooks/useVideos.ts`)
      into a hook polling Phase 0's batch endpoint (~1.5s interval) for the
      store's current `processing`-status `videoId` set, updating each entry
      to `ready`/`failed` based on job outcomes. Keep the existing per-video
      `useVideoProcessing` for the standalone `ProcessingBadge` use case if
      still needed elsewhere, or replace it entirely if the batch hook fully
      subsumes it — check remaining call sites before deleting.
- [ ] Failed processing jobs get a retry action hitting the existing
      `POST /jobs/{job_id}/retry`.
- [ ] Tests: runner concurrency cap (never more than 3 in flight), status
      transition correctness per outcome (skip/success/upload-fail/job-fail),
      retry re-invokes only the failed entry.
- [ ] Verify: `npm run test` green.

## Phase 6 — Frontend: UploadTray component

- [ ] New `frontend/src/features/folders/UploadTray.tsx` (or
      `frontend/src/components/UploadTray.tsx` if it's app-shell-generic),
      fixed-position (e.g. bottom-right), rendered once in the app shell.
      Lists every non-idle entry from the Phase 3 store with its status via
      the existing `Badge` component (`frontend/src/components/ui/Badge`);
      per-entry dismiss action; a "clear completed" action wired to the
      store's `clearCompleted()`.
- [ ] Tests: renders one row per entry with correct status badge, dismiss
      removes just that entry, "clear completed" only removes `ready`
      entries and leaves others.
- [ ] Verify: `npm run test` green.

## Phase 7 — End-to-end verification

- [ ] Manual click-through per `PLAYWRIGHT_MANUAL_TESTING.md` conventions:
      drop multiple files onto a folder, drop an OS folder containing
      videos, use the folder-select button, confirm the tray tracks all of
      them through to ready/failed, confirm a duplicate (same file dropped
      twice, or re-dropping an already-uploaded file) is skipped without a
      network upload (check devtools network tab), confirm a small
      (<=720p) source video has no `PROXY` asset created but still plays.
- [ ] Verify: `make check` (backend) and `npm run test` (frontend) both
      green; note any pre-existing flakiness separately rather than
      attributing it to this work (see `TODO_FRONTEND_OVERHAUL.md` Phase 5
      for the precedent on documenting pre-existing test flakiness).
