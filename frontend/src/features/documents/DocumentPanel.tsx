import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useCreateDocument, useDeleteDocument, useDocuments } from '../../api/hooks/useDocuments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { DocumentEditor } from './DocumentEditor'
import { ClipPreviewPlayer } from './ClipPreviewPlayer'
import { FileText as DocumentIcon, Trash2 as TrashIcon, X as CloseIcon } from 'lucide-react'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

/**
 * The persistent, project-scoped document-builder panel docked in `AppShell`
 * as a resizable `Panel` sibling of the routed page, inside the same
 * `Group`. Collapses to a thin toggle rail when closed (mirrored onto the
 * `Panel` via `panelRef.collapse()`/`.expand()`, bridged from the `isOpen`
 * store flag below); stays mounted across navigation so browsing and
 * writing can happen at the same time.
 */
export function DocumentPanel({
  panelRef,
}: {
  /** Optional so existing standalone tests (rendered outside `AppShell`'s
   * `Panel`) don't need to fabricate one — the effect below just no-ops. */
  panelRef?: RefObject<PanelImperativeHandle | null>
}) {
  const isOpen = useDocumentPanelStore((s) => s.isOpen)
  const activeProjectId = useDocumentPanelStore((s) => s.activeProjectId)
  const activeDocumentId = useDocumentPanelStore((s) => s.activeDocumentId)
  const openPanel = useDocumentPanelStore((s) => s.open)
  const close = useDocumentPanelStore((s) => s.close)
  const setActiveDocument = useDocumentPanelStore((s) => s.setActiveDocument)
  const previewClip = useDocumentPanelStore((s) => s.previewClip)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)

  const { data: documents } = useDocuments(activeProjectId)
  const createDocument = useCreateDocument(activeProjectId ?? '')
  const deleteDocument = useDeleteDocument(activeProjectId ?? '')
  const [newTitle, setNewTitle] = useState('')

  // Default to the most recently updated document once the list loads and
  // nothing is selected yet (e.g. the panel was just opened for this project).
  useEffect(() => {
    if (activeDocumentId === null && documents && documents.length > 0) {
      setActiveDocument(documents[0].id)
    }
  }, [documents, activeDocumentId, setActiveDocument])

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

  function handleCreate() {
    const title = newTitle.trim() || 'Untitled document'
    createDocument.mutate(title, { onSuccess: (doc) => setActiveDocument(doc.id) })
    setNewTitle('')
  }

  function handleDelete(documentId: string) {
    deleteDocument.mutate(documentId, {
      onSuccess: () => {
        if (activeDocumentId === documentId) setActiveDocument(null)
      },
    })
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <DocumentIcon className="h-4 w-4 text-text-muted" />
        <span className="text-body font-semibold text-text">Documents</span>
        <button
          type="button"
          aria-label="Close document panel"
          title="Close"
          onClick={close}
          className="ml-auto rounded-md p-1 text-text-muted hover:bg-surface-raised hover:text-text"
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

      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Select
          aria-label="Active document"
          value={activeDocumentId ?? ''}
          onValueChange={(value) => setActiveDocument(value || null)}
          placeholder="Select a document…"
          options={(documents ?? []).map((doc) => ({ value: doc.id, label: doc.title }))}
          className="min-w-0 flex-1"
        />
        {activeDocumentId && (
          <button
            type="button"
            aria-label="Delete document"
            title="Delete document"
            onClick={() => handleDelete(activeDocumentId)}
            className="rounded-md p-1.5 text-text-muted hover:bg-danger-subtle hover:text-danger-text"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New document title…"
          className="min-w-0 flex-1"
        />
        <Button size="sm" onClick={handleCreate} className="shrink-0">
          New
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {activeProjectId && activeDocumentId ? (
          <DocumentEditor projectId={activeProjectId} documentId={activeDocumentId} />
        ) : (
          <div className="p-6 text-center text-body text-text-muted">
            {documents?.length === 0
              ? 'No documents yet. Create one above.'
              : 'Select a document to start writing.'}
          </div>
        )}
      </div>
    </div>
  )
}
