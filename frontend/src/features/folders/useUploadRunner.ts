import { useCallback, useEffect, useRef } from 'react'
import {
  checkDuplicateVideo,
  uploadVideoFile,
  useBatchVideoStatus,
} from '../../api/hooks/useVideos'
import { retryJob } from '../../api/hooks/useJobs'
import { useUploadQueueStore, type UploadEntry } from '../../store/uploadQueue'

const CONCURRENCY_LIMIT = 3
const IN_FLIGHT_STATUSES = new Set<UploadEntry['status']>(['checking', 'uploading'])

/**
 * Drains the global upload queue (`store/uploadQueue.ts`): each `queued`
 * entry runs duplicate-check → upload → processing, capped at
 * `CONCURRENCY_LIMIT` entries in flight at once (queued/checking/uploading
 * together, not per-stage), then polls the batch status endpoint for every
 * entry that reached `processing` until it settles at `ready`/`failed`. One
 * entry's failure never touches any other — every transition is scoped to
 * that entry's own `localId` (see the design spec's per-file independence
 * requirement).
 *
 * Mount once, e.g. alongside `UploadTray` in the app shell — it has no
 * return value beyond `retryEntry`; the drain/poll behavior is a side effect
 * on the shared store, not something callers read a value from.
 */
export function useUploadRunner(): { retryEntry: (localId: string) => void } {
  const entries = useUploadQueueStore((s) => s.entries)
  const updateStatus = useUploadQueueStore((s) => s.updateStatus)
  // Entries this runner has already claimed off `queued`, so a re-render
  // triggered by an unrelated entry's status change doesn't re-dispatch the
  // same file's duplicate-check/upload a second time.
  const inFlightRef = useRef<Set<string>>(new Set())

  // `useCallback` (rather than a plain function) so this has a stable
  // identity across renders — `updateStatus` is a zustand action, stable by
  // construction — letting the effects below depend on it without
  // re-running on every unrelated render.
  const runEntry = useCallback(
    async (entry: UploadEntry) => {
      updateStatus(entry.localId, { status: 'checking' })
      let isDuplicate: boolean
      try {
        const result = await checkDuplicateVideo(entry.folderId, entry.fileName, entry.fileSize)
        isDuplicate = result.is_duplicate
      } catch {
        updateStatus(entry.localId, { status: 'failed', error: 'Could not check for duplicates' })
        inFlightRef.current.delete(entry.localId)
        return
      }
      if (isDuplicate) {
        updateStatus(entry.localId, { status: 'skipped' })
        inFlightRef.current.delete(entry.localId)
        return
      }

      // Read fresh rather than closing over a render-time snapshot: this runs
      // well after the render that queued it.
      const file = useUploadQueueStore.getState().files[entry.localId]
      if (!file) {
        updateStatus(entry.localId, { status: 'failed', error: 'File is no longer available' })
        inFlightRef.current.delete(entry.localId)
        return
      }
      updateStatus(entry.localId, { status: 'uploading' })
      try {
        const result = await uploadVideoFile(entry.folderId, file)
        updateStatus(entry.localId, {
          status: 'processing',
          videoId: result.video_id,
          jobIds: [result.processing_job_id],
        })
      } catch {
        updateStatus(entry.localId, { status: 'failed', error: 'Upload failed' })
      } finally {
        inFlightRef.current.delete(entry.localId)
      }
    },
    [updateStatus],
  )

  useEffect(() => {
    const activeCount = entries.filter((e) => IN_FLIGHT_STATUSES.has(e.status)).length
    const capacity = CONCURRENCY_LIMIT - activeCount
    if (capacity <= 0) return
    const next = entries
      .filter((e) => e.status === 'queued' && !inFlightRef.current.has(e.localId))
      .slice(0, capacity)
    for (const entry of next) {
      inFlightRef.current.add(entry.localId)
      void runEntry(entry)
    }
  }, [entries, runEntry])

  const processingVideoIds = entries
    .filter((e): e is UploadEntry & { videoId: string } => e.status === 'processing' && !!e.videoId)
    .map((e) => e.videoId)
  const { data: statuses } = useBatchVideoStatus(processingVideoIds, processingVideoIds.length > 0)

  useEffect(() => {
    if (!statuses) return
    for (const status of statuses) {
      const entry = entries.find((e) => e.videoId === status.video_id && e.status === 'processing')
      if (!entry) continue
      if (status.status === 'ready') {
        updateStatus(entry.localId, { status: 'ready' })
      } else if (status.status === 'failed') {
        const failedJobIds = status.jobs.filter((j) => j.status === 'failed').map((j) => j.id)
        updateStatus(entry.localId, {
          status: 'failed',
          error: 'Processing failed',
          jobIds: failedJobIds,
        })
      }
    }
  }, [statuses, entries, updateStatus])

  function retryEntry(localId: string) {
    const entry = useUploadQueueStore.getState().entries.find((e) => e.localId === localId)
    if (!entry) return
    if (entry.videoId) {
      // A processing-stage (job) failure: the upload already succeeded, so
      // retry each failed job and resume polling rather than re-uploading.
      const jobIds = entry.jobIds ?? []
      void Promise.all(jobIds.map((id) => retryJob(id))).then(() => {
        updateStatus(localId, { status: 'processing', error: undefined })
      })
    } else {
      // A duplicate-check or upload-stage failure: no video was created, so
      // just re-queue — the drain loop above picks it back up.
      updateStatus(localId, { status: 'queued', error: undefined })
    }
  }

  return { retryEntry }
}
