# Search redesign — implementation TODO

Persistent, git-tracked task checklist for the search feature redesign, mirroring the style of `TODO.md`. Full design record / rationale: `/Users/jan/.claude/plans/whimsical-launching-fog.md` — read it before starting; this file is the checklist, that file is the "why".

Any agent picking this up should work top to bottom and check items off (edit this file and commit) as they land — don't just remember it. Same rules as `TODO.md` apply: fully typed Python (`mypy --strict`), ruff lint+format clean, tests-first (write failing tests, then implement), test tree mirrors source tree. On the frontend: no `any` on API boundaries (regenerate `schema.d.ts` after backend changes via `make openapi`), server state (TanStack Query) stays separate from local UI state (zustand). Backend work must pass `make check` before moving to frontend work that depends on it.

## Context (see the plan file for full detail)

Search today is a flat, ungrouped list of individual token/speaker/comment hits in a small ⌘F popup (`SearchOverlay.tsx`), with no video/folder context beyond a bare timestamp, and clicking a result to view it destroys all search state (no way back to compare other options). This redesign: (1) groups hits per video with a thumbnail, video name, and folder path, followed by every matching timestamp within that video; (2) turns search into a dedicated page addressed by URL (`?q=`) so browser back / an explicit link restores the exact same results; (3) adds real video thumbnails, which don't exist anywhere in the app yet.

## Phase — Backend: grouped, paginated search

- [x] `backend/app/schemas/search.py`: replace flat `SearchResult` with `SearchHitRead` (kind, id, transcript_id, text, start_time, rank) + `SearchVideoGroup` (video_id, video_name, folder_path: list[str], thumbnail_token: str | None, hits: list[SearchHitRead], hit_count: int) + `SearchResponse` (groups, total_videos, limit, offset)
- [x] `backend/app/services/search.py`: group `SearchHit`s by `video_id` in Python after the existing three `tsvector` queries (don't touch the queries themselves); sort each group's hits by `start_time` ascending (speaker-kind, no `start_time`, sorts last); cap at `MAX_HITS_PER_VIDEO = 20` per group with accurate `hit_count`; rank groups by best hit `rank` descending; paginate the group list via new `limit`/`offset` params
- [x] New `backend/app/services/folders.py`: `build_folder_breadcrumbs(session, folder_ids) -> dict[folder_id, list[str]]` — breadth-first walk of `parent_folder_id` with an in-memory cache (one query per tree depth, not per video)
- [x] `backend/app/api/routes/search.py`: add `limit: int = Query(10, ge=1, le=50)` / `offset: int = Query(0, ge=0)`; mint `thumbnail_token` per group via the existing `mint_media_token`
- [x] Tests first: rewrite `backend/tests/api/routes/test_search.py` + `backend/tests/services/test_search.py` around the grouped/paginated shape (grouping, breadcrumb correctness, pagination, hit ordering, cap + `hit_count`, `thumbnail_token` presence); new `backend/tests/services/test_folders.py` (flat / nested / shared-ancestor)
- [x] Verify: `make check` green

## Phase — Backend: thumbnail generation

- [x] `backend/app/models/job.py`: add `JobType.GENERATE_THUMBNAIL` — note: a migration *was* needed in practice (see below), the plain-`VARCHAR` column was sized to the longest enum value at creation time and `"generate_thumbnail"` (18 chars) exceeded it
- [x] `backend/app/media/ffmpeg.py`: add `thumbnail_args`/`generate_thumbnail`, mirroring `proxy_args`/`generate_proxy` in the same file — one frame at 10% into the video, `scale=480:-2`, jpg output
- [x] `backend/app/worker/media.py`: add `thumbnail_key(video_id)`, next to `proxy_key`/`waveform_key`
- [x] New `backend/app/worker/handlers/thumbnail.py`: mirror `backend/app/worker/handlers/waveform.py` — idempotent skip if a `THUMBNAIL` asset exists, read `ORIGINAL`, generate, write `VideoAsset(type=THUMBNAIL, mime_type="image/jpeg", ...)`
- [x] `backend/app/services/pipeline.py`: insert `GENERATE_THUMBNAIL` into `UPLOAD_PIPELINE` between `GENERATE_PROXY` and `GENERATE_WAVEFORM`
- [x] `backend/app/worker/runner.py`: register `JobType.GENERATE_THUMBNAIL: handle_generate_thumbnail` in `HANDLERS`
- [x] `backend/app/api/routes/videos.py`: new `GET /videos/{video_id}/thumbnail`, mirroring `stream_proxy`'s media-token auth pattern; 404 if no thumbnail asset yet
- [x] Tests first: new `backend/tests/worker/handlers/test_thumbnail.py` (mirror `test_waveform.py`); extend `backend/tests/api/routes/test_videos.py` for the thumbnail route (404/200/auth); update `backend/tests/services/test_pipeline.py`'s `test_stage_order` for the new chain link
- [x] Verify: `make check` green — 229 passed, 1 pre-existing unrelated failure (`test_build_document_resolves_speaker_name`, fails identically on `main`, caused by leftover data in the shared dev Postgres)
- [x] Extra (discovered during verification, not in original checklist): `backend/alembic/versions/f0aad2de47b4_0008_generate_thumbnail_job_type.py` — widens `processing_jobs.type` to fit the new enum value; autogenerated, upgrade/downgrade round-trip verified

## Phase — Backend: expose `VideoRead.project_id`

- [x] `Video.project_id` already exists on the model — add it to `backend/app/schemas/video.py`'s `VideoRead` and the `_video_read()` builder in `backend/app/api/routes/videos.py`
- [x] Update any `VideoRead` JSON-equality assertions in `backend/tests/api/routes/test_videos.py` that need the new field
- [x] Verify: `make check` green

## Phase — Frontend: regenerate types

- [x] Run `make openapi` (repo root) after all backend phases above are merged/complete, before starting any frontend work below

## Phase — Frontend: search hook + media helper

- [x] `frontend/src/api/hooks/useSearch.ts`: replace flat `useSearch` with `useSearchGroups(projectId, q)` using TanStack Query's `useInfiniteQuery` (`queryKey: ['search', projectId, query]`, `initialPageParam: 0`, `getNextPageParam` from `offset + groups.length < total_videos`)
- [x] `frontend/src/api/hooks/useMedia.ts`: add `thumbnailUrl(videoId, token)`, mirroring the existing `proxyUrl`
- [x] Verify: `npm run typecheck` clean

## Phase — Frontend: dedicated search page

- [x] `frontend/src/app/routes.tsx`: add `{ path: 'projects/:projectId/search', element: <SearchPage /> }`
- [x] New `frontend/src/pages/SearchPage.tsx`: input synced to `useSearchParams()`'s `q` (debounce 250ms, `replace: true`), `useSearchGroups`, renders groups via `SearchVideoGroupCard`, "Load more" when `hasNextPage`
- [x] New `frontend/src/features/search/SearchVideoGroupCard.tsx`: thumbnail `<img>` (fallback to existing `VideoIcon` placeholder when `thumbnail_token` is null) + video name + folder breadcrumb (`folder_path.join(' / ')`, `FolderIcon` prefix — reuse the row style already in `frontend/src/features/folders/FolderPanel.tsx`) + hit rows (kind badge + text + `formatTime(start_time)`, same styling as the old `SearchOverlay` rows) + "+N more matches" hint when `hit_count > hits.length`
- [x] Tests first: new `frontend/src/pages/SearchPage.test.tsx` (query↔URL sync, grouped rendering incl. placeholder thumbnail, no-results, hit-click nav payload incl. `returnTo`, load-more pagination)
- [x] Verify: `npm run test` green

## Phase — Frontend: navigation + return-to-search

- [x] New `PendingSearchNav` type (camelCase, matching `FolderTree.tsx`'s `VideoDragPayload` convention for frontend-only payloads): `{ kind, id, transcriptId, startTime, returnTo }`, `returnTo` = `location.pathname + location.search` captured at click time — landed in new `frontend/src/features/search/types.ts` (shared by producer `SearchPage` and consumer `VideoWorkspace`)
- [x] `frontend/src/pages/VideoWorkspace.tsx`: update the existing `pendingSearch` effect (already reads `location.state`, already switches on `kind` — logic unchanged, just field names) to the new shape; add a "← Back to search" link in the top bar next to "← Projects", shown only when `pendingSearch?.returnTo` is set, linking to that exact URL
- [x] Opportunistic: point the existing "← Projects" link at `/projects/${video.project_id}` instead of `/`, now that `project_id` is available
- [x] Tests first: update `frontend/src/pages/VideoWorkspace.test.tsx` (mock `GET /videos/{id}` to include `project_id`; update the two existing search-arrival tests to the new state shape; add a back-to-search-link test)
- [x] Verify: `npm run test` green

## Phase — Frontend: entry points + cleanup

- [x] `frontend/src/pages/ProjectView.tsx`: remove `SearchOverlay` usage and `searchOpen` state; "Search ⌘F" button and the ⌘F keydown handler both `navigate(`/projects/${projectId}/search`)`
- [x] Delete `frontend/src/features/search/SearchOverlay.tsx` and `SearchOverlay.test.tsx`
- [x] Update `frontend/src/pages/ProjectView.test.tsx`: replace the two modal-based search tests with navigation-to-`/search`-route assertions
- [x] Verify: `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build` all clean — 59 tests passed, build clean (pre-existing >500kB single-chunk warning unrelated to this work)

## Phase — End-to-end verification

- [ ] Run `make run-backend`, `make run-worker`, `make run-frontend`; upload a video, confirm a thumbnail job runs and `GET /videos/{id}/thumbnail` serves an image once processing completes
- [ ] Search a project for a term that hits multiple videos and multiple times within one video; confirm grouping, folder breadcrumb, and timestamp list render correctly
- [ ] Click a hit; confirm the video seeks/highlights as before
- [ ] Confirm the new "← Back to search" link returns to the same query and results
- [ ] Confirm pagination ("Load more") when a query matches more than the page size
