# Bulk Video Upload — Design Spec

## Context

Today, uploading a video is single-file only: one hidden `<input type="file">`, one
`POST /folders/{folder_id}/videos` request, one `Video` row, one `ProcessingJob`. Status is
shown per-video via a badge that's tracked in local component state and lost on remount.

Users need to import many videos at once — dragging a batch of files, or an entire folder
of footage, onto a project folder — and see all of them progress through upload and
processing without losing track when they navigate elsewhere in the app. Because these are
often large camera files, we also want to avoid wasted work: skip re-uploading files that
are already present, and skip proxy transcoding for videos where it wouldn't help playback.

## Goals

- Drag-and-drop multiple files, or an entire OS folder, onto a project folder to upload them
  all (flat — no subfolder mirroring into app Folders).
- A persistent, app-wide tray shows every in-flight upload/processing item and survives
  in-app navigation.
- Files already present in the target folder (same filename + size) are skipped
  automatically, without uploading their bytes.
- Proxy transcoding is skipped for videos that wouldn't benefit from it, falling back to
  direct original playback.
- One file failing doesn't block or cancel the rest of the batch.

## Non-goals

- Recreating OS subfolder structure as nested app Folders.
- A new bulk-upload wire format (uploads stay one file per HTTP request).
- Surviving a hard page reload (the tray is in-memory for the SPA session; per-video status
  in the folder view remains correct regardless, since it reads from the server).
- Enforcing duplicate detection as a hard DB constraint — it's a courtesy skip, not a
  uniqueness guarantee, and a narrow race window between two simultaneous uploads of the same
  file is accepted.

## Backend changes

### 1. Batch status endpoint

`GET /videos/status?ids=<uuid>,<uuid>,...`

Returns job status for a set of video IDs in one call, replacing what would otherwise be N
individual `GET /videos/{id}` polls from the tray. Authorization is still checked per ID
(project membership), same as every other video route. Response shape mirrors the existing
`VideoRead.jobs` field, just batched:

```
[{ "video_id": "...", "status": "processing" | "ready" | "failed", "jobs": [...] }, ...]
```

### 2. Duplicate-check endpoint

`GET /folders/{folder_id}/videos/duplicate-check?filename=<str>&size=<int>`

Looks for an existing video in that folder whose `original_filename` matches and whose
`VideoAsset(type=ORIGINAL).size` matches. Returns `{ "is_duplicate": bool, "video_id":
uuid | null }`. Called by the frontend *before* starting each file's upload, so a duplicate
is caught without transferring its bytes.

Matching on filename + size (not filename alone) because camera-default filenames
(`MVI_0001.MP4`) routinely collide across unrelated clips from different cards; requiring
both to match makes a false-positive skip very unlikely while still being cheap to check.

### 3. Conditional proxy generation

`handle_generate_proxy` (`backend/app/worker/handlers/proxy.py`) gains one early-exit: if
`video.height <= 720` (the existing proxy transcode target), skip creating a `PROXY`
`VideoAsset` and complete the job as a no-op. `video.height` is already populated by the
preceding `EXTRACT_METADATA` stage, so no new data is needed.

No change is needed anywhere else: `GET /videos/{id}/proxy` already falls back to the
`ORIGINAL` asset when no `PROXY` asset exists (`videos.py`), so playback keeps working
transparently for videos where proxy generation was skipped.

## Frontend changes

### 1. Global upload queue store

A new store (mounted once at the app shell root, not per-page) holds every upload/processing
item for the session. Each entry:

```
{
  localId, folderId, fileName, fileSize,
  status: "queued" | "checking" | "skipped" | "uploading" | "processing" | "ready" | "failed",
  videoId?, jobIds?, error?
}
```

Surviving in-app navigation is what makes the tray "global" — it's just a store outside the
folder-view component tree, not a persistence layer. A hard reload loses it, matching the
accepted limitation above.

### 2. Enqueueing files

Two entry points, both feeding the same store:

- **Drop target**: the existing folder view (`FolderPanel`) starts accepting OS file/folder
  drags, distinguished from the app's existing internal drag-and-drop (used today for moving
  videos between folders) by checking `dataTransfer.types` for `"Files"`. Dropped folders are
  walked recursively via `DataTransferItem.webkitGetAsEntry()`, since a folder drop doesn't
  hand you its nested files directly.
- **Folder picker button**: a new control next to today's upload button, using
  `<input type="file" webkitdirectory multiple>` (Firefox, which doesn't support
  `webkitdirectory`, falls back to plain multi-file select).

Non-video files (by extension, matching the backend's `ALLOWED_EXTENSIONS`) are filtered out
client-side before anything is enqueued.

### 3. Queue runner

Before anything is enqueued, entries within the same drop/selection are deduped in-memory by
filename + size — dropping the same file twice in one batch keeps only one entry, `skipped`.
This also closes a race the server-side check alone can't: two identical files entering
`checking` at the same time could otherwise both pass before either has created its `Video`
row.

A runner capped at 3 concurrent in-flight entries then drains `queued` entries:

1. `queued → checking`: call the duplicate-check endpoint. Match → `skipped`, done. No match
   → continue.
2. `checking → uploading`: POST to the existing `POST /folders/{folder_id}/videos`.
   Success → `processing` (store `videoId`/`jobIds`). Failure (validation or network) →
   `failed`, independent of every other entry, with a retry action that re-runs this file's
   POST.
3. While any entries are `processing`, a hook polls the new batch-status endpoint (~1.5s
   interval) for the current in-flight `videoId` set, updating each to `ready` or `failed`
   based on job outcomes. This generalizes today's `useVideoProcessing` hook from one video to
   the whole live set in one request.
4. Job-level failures surface a retry that hits the existing `POST /jobs/{job_id}/retry`.

### 4. UploadTray component

A persistent panel (e.g. fixed bottom-right), rendered once in the app shell, listing every
non-idle entry with its status. Supports dismissing entries individually and a "clear
completed" action for all `ready` entries at once. Reuses the existing `Badge` component for
status pills.

## Error handling

- Extension validation happens client-side before any network call.
- Duplicate check happens before the byte transfer, not after, to avoid uploading large files
  that will just be discarded.
- Every file is independent from enqueue through completion — one failure (duplicate check
  error, upload error, or a failed processing job) never blocks or cancels siblings in the
  same batch.

## Testing

- Backend: unit tests for the batch-status endpoint (per-ID authorization, correct shape,
  partial/empty ID sets) and the duplicate-check endpoint (match on filename+size, no match on
  filename-only collision, folder-scoping). Unit test for `handle_generate_proxy`'s skip
  branch (no `PROXY` asset created when `height <= 720`, job still completes) and a regression
  test that the serving route's existing fallback still returns `ORIGINAL` in that case.
- Frontend: unit tests for the queue store (concurrency cap, state transitions, retry
  behavior) and for OS-folder-drop enumeration (mocking `webkitGetAsEntry`). Manual
  click-through per `PLAYWRIGHT_MANUAL_TESTING.md` for the drop zone, folder picker, and tray
  UI end-to-end.
