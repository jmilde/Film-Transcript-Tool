import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { RefObject } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useDeleteDocument, useDocuments } from '../../api/hooks/useDocuments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { DocumentEditor } from './DocumentEditor'
import { DocumentTabStrip } from './DocumentTabStrip'
import { ClipPreviewPlayer } from './ClipPreviewPlayer'
import {
  Expand as ExpandIcon,
  FileText as DocumentIcon,
  X as CloseIcon,
} from 'lucide-react'

/**
 * The persistent, project-scoped document-builder panel docked in `AppShell`
 * as a resizable `Panel` sibling of the routed page, inside the same
 * `Group`. Collapses to a thin toggle rail when closed (mirrored onto the
 * `Panel` via `panelRef.collapse()`/`.expand()`, bridged from the `isOpen`
 * store flag below); stays mounted across navigation so browsing and
 * writing can happen at the same time.
 *
 * Documents open as tabs (`store/documentPanel.ts`'s `openDocumentIds`),
 * letting more than one stay open at once and be switched between without
 * losing place — a "+" opens an existing document as a new tab, a separate
 * button creates a brand new one, and each tab's own options menu handles
 * rename/delete instead of a persistent input row and a lone delete button.
 */
export function DocumentPanel({
  panelRef,
}: {
  /** Optional so existing standalone tests (rendered outside `AppShell`'s
   * `Panel`) don't need to fabricate one — the effect below just no-ops. */
  panelRef?: RefObject<PanelImperativeHandle | null>
}) {
  const navigate = useNavigate()
  const isOpen = useDocumentPanelStore((s) => s.isOpen)
  const activeProjectId = useDocumentPanelStore((s) => s.activeProjectId)
  const openDocumentIds = useDocumentPanelStore((s) => s.openDocumentIds)
  const activeDocumentId = useDocumentPanelStore((s) => s.activeDocumentId)
  const openPanel = useDocumentPanelStore((s) => s.open)
  const close = useDocumentPanelStore((s) => s.close)
  const openTab = useDocumentPanelStore((s) => s.openTab)
  const closeTab = useDocumentPanelStore((s) => s.closeTab)
  const previewClip = useDocumentPanelStore((s) => s.previewClip)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)

  const { data: documents } = useDocuments(activeProjectId)
  const deleteDocument = useDeleteDocument(activeProjectId ?? '')

  // Default to the most recently updated document the *first* time this
  // project's list loads with no tab open yet (e.g. the panel was just
  // opened for this project) — gated by a ref, not just "no tabs open", so
  // this can't re-fire and undo a deliberate close-last-tab: deleting the
  // only open tab invalidates this same `documents` query, and a stale
  // still-populated cache read racing that refetch would otherwise look
  // identical to "freshly opened with nothing selected yet".
  const autoOpenedForProject = useRef<string | null>(null)
  useEffect(() => {
    if (!activeProjectId || !documents) return
    if (autoOpenedForProject.current === activeProjectId) return
    autoOpenedForProject.current = activeProjectId
    if (openDocumentIds.length === 0 && documents.length > 0) {
      openTab(documents[0].id)
    }
  }, [activeProjectId, documents, openDocumentIds.length, openTab])

  // One-directional bridge: the store's `isOpen` flag is the single source
  // of truth, mirrored onto the `Panel`'s own collapsed state. Both methods
  // are no-ops if the panel is already in the target state (or, in tests
  // that render this component standalone, if `panelRef` is undefined).
  useEffect(() => {
    if (isOpen) panelRef?.current?.expand()
    else panelRef?.current?.collapse()
  }, [isOpen, panelRef])

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label="Open document panel"
        title="Documents"
        onClick={() => activeProjectId && openPanel(activeProjectId)}
        disabled={!activeProjectId}
        className="flex h-full w-full items-start justify-center border-l border-border bg-surface py-4 text-text-muted hover:bg-surface-raised hover:text-text disabled:opacity-40"
      >
        <DocumentIcon className="h-5 w-5" />
      </button>
    )
  }

  function handleDelete(documentId: string) {
    deleteDocument.mutate(documentId, { onSuccess: () => closeTab(documentId) })
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <DocumentIcon className="h-4 w-4 text-text-muted" />
        <span className="text-body font-semibold text-text">Documents</span>
        <button
          type="button"
          aria-label="Open fullscreen"
          title="Open fullscreen"
          disabled={!activeProjectId || !activeDocumentId}
          onClick={() =>
            activeProjectId &&
            activeDocumentId &&
            void navigate(`/projects/${activeProjectId}/documents/${activeDocumentId}`)
          }
          className="ml-auto rounded-md p-1 text-text-muted hover:bg-surface-raised hover:text-text disabled:opacity-40"
        >
          <ExpandIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Close document panel"
          title="Close"
          onClick={close}
          className="rounded-md p-1 text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {previewClip && (
        <div className="relative border-b border-border">
          <button
            type="button"
            aria-label="Close preview"
            title="Close preview"
            onClick={() => setPreviewClip(null)}
            className="absolute top-1 right-1 z-10 rounded-md bg-black/50 p-1 text-white hover:bg-black/70"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
          <ClipPreviewPlayer
            videoId={previewClip.videoId}
            startTime={previewClip.startTime}
            endTime={previewClip.endTime}
          />
        </div>
      )}

      {activeProjectId && (
        <DocumentTabStrip
          projectId={activeProjectId}
          documents={documents}
          openDocumentIds={openDocumentIds}
          activeDocumentId={activeDocumentId}
          onActivate={openTab}
          onClose={closeTab}
          onDelete={handleDelete}
        />
      )}

      <div className="min-h-0 flex-1">
        {activeProjectId && activeDocumentId ? (
          <DocumentEditor projectId={activeProjectId} documentId={activeDocumentId} />
        ) : (
          <div className="p-6 text-center text-body text-text-muted">
            {documents?.length === 0
              ? 'No documents yet. Create one to get started.'
              : 'Select a document to start writing.'}
          </div>
        )}
      </div>
    </div>
  )
}
