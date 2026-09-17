import { X } from 'lucide-react'
import { useUploadRunner } from '../features/folders/useUploadRunner'
import { useUploadQueueStore, type UploadStatus } from '../store/uploadQueue'
import { Badge, type BadgeVariant } from './ui/Badge'
import { Button } from './ui/Button'

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: 'Queued',
  checking: 'Checking…',
  skipped: 'Skipped (duplicate)',
  uploading: 'Uploading…',
  processing: 'Processing…',
  ready: 'Ready',
  failed: 'Failed',
}

const STATUS_VARIANT: Record<UploadStatus, BadgeVariant> = {
  queued: 'neutral',
  checking: 'neutral',
  skipped: 'info',
  uploading: 'warning',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
}

/**
 * App-shell-mounted (not per-folder) tray of every upload/processing item
 * for the session — see `store/uploadQueue.ts`. Also mounts
 * `useUploadRunner`, which has no UI of its own, so the tray showing up in
 * the tree is what actually drives the queue; there's no separate mount
 * point for it elsewhere.
 */
export function UploadTray() {
  const entries = useUploadQueueStore((s) => s.entries)
  const dismiss = useUploadQueueStore((s) => s.dismiss)
  const clearCompleted = useUploadQueueStore((s) => s.clearCompleted)
  const { retryEntry } = useUploadRunner()

  if (entries.length === 0) return null

  const hasReady = entries.some((e) => e.status === 'ready')

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-h-[60vh] w-80 flex-col overflow-hidden rounded-xl border border-glass-line bg-glass-strong shadow-lg backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 border-b border-glass-line px-3 py-2">
        <h4 className="text-small font-medium text-text">Uploads</h4>
        <Button variant="ghost" size="sm" disabled={!hasReady} onClick={() => clearCompleted()}>
          Clear completed
        </Button>
      </div>
      <ul className="flex-1 divide-y divide-glass-line overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.localId} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-small text-text" title={entry.fileName}>
                {entry.fileName}
              </p>
              <Badge variant={STATUS_VARIANT[entry.status]} className="mt-1" title={entry.error}>
                {STATUS_LABEL[entry.status]}
              </Badge>
            </div>
            {entry.status === 'failed' && (
              <Button variant="ghost" size="sm" onClick={() => retryEntry(entry.localId)}>
                Retry
              </Button>
            )}
            <button
              type="button"
              aria-label={`Dismiss ${entry.fileName}`}
              onClick={() => dismiss(entry.localId)}
              className="shrink-0 rounded p-1 text-text-muted hover:bg-glass hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
