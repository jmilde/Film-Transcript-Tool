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

- [x] New hook/module (e.g. `frontend/src/features/folders/useUploadRunner.ts`)
      draining `queued` entries from the Phase 3 store with a concurrency cap
      of 3: `queued → checking` (call Phase 1's duplicate-check endpoint;
      match → `skipped`; no match → continue) `→ uploading` (POST via the
      existing `useUploadVideo`/equivalent in `frontend/src/api/hooks/useVideos.ts`;
      success → `processing` with `videoId`; failure → `failed` with a retry
      action that re-invokes just this entry).
- [x] Generalize `useVideoProcessing` (`frontend/src/api/hooks/useVideos.ts`)
      into a hook polling Phase 0's batch endpoint (~1.5s interval) for the
      store's current `processing`-status `videoId` set, updating each entry
      to `ready`/`failed` based on job outcomes. Keep the existing per-video
      `useVideoProcessing` for the standalone `ProcessingBadge` use case if
      still needed elsewhere, or replace it entirely if the batch hook fully
      subsumes it — check remaining call sites before deleting.
      (Kept `useVideoProcessing` as-is — added a new `useBatchVideoStatus`
      hook alongside it rather than modifying it in place, since
      `ProcessingBadge` in `FolderPanel.tsx` is still a live single-video
      call site for the standalone single-file upload button.)
- [x] Failed processing jobs get a retry action hitting the existing
      `POST /jobs/{job_id}/retry`.
- [x] Tests: runner concurrency cap (never more than 3 in flight), status
      transition correctness per outcome (skip/success/upload-fail/job-fail),
      retry re-invokes only the failed entry.
- [x] Verify: `npm run test` green.

## Phase 6 — Frontend: UploadTray component

- [x] New `frontend/src/features/folders/UploadTray.tsx` (or
      `frontend/src/components/UploadTray.tsx` if it's app-shell-generic),
      fixed-position (e.g. bottom-right), rendered once in the app shell.
      Lists every non-idle entry from the Phase 3 store with its status via
      the existing `Badge` component (`frontend/src/components/ui/Badge`);
      per-entry dismiss action; a "clear completed" action wired to the
      store's `clearCompleted()`.
      (Placed in `components/` — app-shell-generic, not folder-scoped. Also
      mounts `useUploadRunner` since nothing else in the tree does; the tray
      being mounted in `AppShell` is what actually drives the queue.)
- [x] Tests: renders one row per entry with correct status badge, dismiss
      removes just that entry, "clear completed" only removes `ready`
      entries and leaves others.
- [x] Verify: `npm run test` green.

## Phase 7 — End-to-end verification

- [x] Manual click-through per `PLAYWRIGHT_MANUAL_TESTING.md` conventions,
      against the real dev stack (backend + worker + frontend + dev
      Postgres), using real ffmpeg-generated clips, in a scratch
      "Bulk Upload Test" folder in the "Test" project:
    - [x] Dropped multiple loose files (360p + 1080p) onto the folder — both
          enqueued, uploaded, and reached `Ready`; new video rows appeared
          in the folder list *without navigating away* (this specifically
          exercises the folder-query-invalidation fix below).
    - [x] Dropped a mix of two `.mp4` files and a `.txt` file as a loose
          multi-file OS drop — both videos reached `Ready`; the `.txt` was
          silently filtered client-side (confirmed via a DB query: no video
          row was ever created for it — zero bytes uploaded, not just
          hidden in the UI).
    - [x] Used the "Select folder" button on a real nested directory
          (top-level file + a file in a subfolder) — both uploaded via the
          real `webkitdirectory` picker and reached `Ready`.
    - [ ] **Not verified: dragging a real OS folder onto the drop zone.**
          Playwright MCP's `browser_drop` explicitly rejects directory
          paths ("Dropping a directory is not supported — pass individual
          files"), so the `webkitGetAsEntry`/`readEntries` recursive-walk
          code path in `fileDrop.ts` could only be exercised by its mocked
          unit tests, not a real browser DnD folder drop. The folder-select
          button's recursion *did* get verified live (same recursive
          semantics, different browser API/code path). If this matters,
          it needs a human dragging a real folder from Finder/Explorer.
    - [x] Re-dropped an already-uploaded file (and a second already-queued
          duplicate within the same drop) — both showed `Skipped
          (duplicate)`; confirmed via the network tab that only the
          `GET .../duplicate-check` request fired, no `POST .../videos`.
    - [x] Confirmed via a direct DB query that the 360p upload has no
          `PROXY` `VideoAsset` row (only `original`/`thumbnail`/`waveform`)
          while the 1080p upload does; opened the 360p video's page and
          confirmed it plays (falls back to `ORIGINAL`, as expected).
    - [x] "Clear completed" removed only `Ready` entries, leaving `Skipped`
          ones in place, and disables itself once nothing is `Ready`.
          Per-entry dismiss removes just that row.
    - [x] Tray persisted across an in-app route change (folder → video page
          → back) and was correctly cleared by a hard reload, matching the
          design spec's session-only non-goal.
    - [ ] Not manually triggered: a `failed` entry + its retry action (well
          covered by `useUploadRunner.test.tsx`'s mocked scenarios; wasn't
          worth forcing a real failure — e.g. killing the worker mid-job —
          for this pass).
    - Found and fixed one real bug during this pass: the runner wasn't
      invalidating the folder query after a successful upload (see the
      "Fix: invalidate the folder query..." commit) — caught by the
      advisor before the manual click-through, then confirmed fixed live.
    - Incidental: found the pre-existing dev backend/frontend processes
      wedged (a backend connection stuck `idle in transaction` for 90+
      minutes, refusing new connections) — restarted both via
      `make run-backend`/`make run-frontend`; unrelated to this feature.
- [x] Verify: `make check` (backend, 376 passed) and `npm run test`
      (frontend, 252 passed) both green. One pre-existing flake unrelated
      to this work: a ProseMirror `DOMObserver`/timer teardown error
      surfaced from `src/features/documents/clipClipboard.test.ts` on one
      run (a document-clipboard test this work never touched) — not
      attributed to this change, per the `TODO_FRONTEND_OVERHAUL.md` Phase
      5 precedent for documenting pre-existing flakiness rather than
      chasing it here.
