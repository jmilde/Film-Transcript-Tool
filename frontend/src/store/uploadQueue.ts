import { create } from 'zustand'

export type UploadStatus =
  'queued' | 'checking' | 'skipped' | 'uploading' | 'processing' | 'ready' | 'failed'

export interface UploadEntry {
  localId: string
  folderId: string
  fileName: string
  fileSize: number
  status: UploadStatus
  videoId?: string
  jobIds?: string[]
  error?: string
}

/**
 * Global (app-shell-mounted, not per-`FolderPanel`) upload tray state —
 * session-scoped, survives in-app navigation, lost on a hard reload (see the
 * design spec's Non-goals). `File` objects themselves are kept here too
 * (not just their metadata) so `useUploadRunner` (Phase 5) can read them
 * back off the store to perform the actual upload, without a second place
 * to look them up by `localId`.
 */
interface UploadQueueState {
  entries: UploadEntry[]
  files: Record<string, File>
  /** Dedupes by filename+size *within this call* (see the design spec's
   * intra-batch race note: two identical files entering `checking`
   * simultaneously could otherwise both pass the duplicate check before
   * either has created its `Video` row) before adding `queued` entries for
   * the rest; the discarded duplicates are added directly as `skipped`. */
  enqueue: (files: File[], folderId: string) => void
  updateStatus: (localId: string, patch: Partial<Omit<UploadEntry, 'localId'>>) => void
  dismiss: (localId: string) => void
  /** Removes only `ready` entries — `failed`/`skipped` entries stay until
   * individually dismissed so their outcome isn't lost silently. */
  clearCompleted: () => void
}

export const useUploadQueueStore = create<UploadQueueState>((set) => ({
  entries: [],
  files: {},
  enqueue: (files, folderId) =>
    set((s) => {
      const seen = new Set<string>()
      const newEntries: UploadEntry[] = []
      const newFiles: Record<string, File> = {}
      for (const file of files) {
        const key = `${file.name}:${file.size}`
        const localId = crypto.randomUUID()
        const isDuplicateInBatch = seen.has(key)
        seen.add(key)
        newEntries.push({
          localId,
          folderId,
          fileName: file.name,
          fileSize: file.size,
          status: isDuplicateInBatch ? 'skipped' : 'queued',
        })
        if (!isDuplicateInBatch) newFiles[localId] = file
      }
      return {
        entries: [...s.entries, ...newEntries],
        files: { ...s.files, ...newFiles },
      }
    }),
  updateStatus: (localId, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.localId === localId ? { ...e, ...patch } : e)),
    })),
  dismiss: (localId) =>
    set((s) => {
      const { [localId]: _removed, ...files } = s.files
      return {
        entries: s.entries.filter((e) => e.localId !== localId),
        files,
      }
    }),
  clearCompleted: () =>
    set((s) => {
      const toRemove = new Set(s.entries.filter((e) => e.status === 'ready').map((e) => e.localId))
      const files = { ...s.files }
      for (const id of toRemove) delete files[id]
      return {
        entries: s.entries.filter((e) => e.status !== 'ready'),
        files,
      }
    }),
}))
