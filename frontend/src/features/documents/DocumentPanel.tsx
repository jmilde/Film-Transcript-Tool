import { useEffect, useState } from 'react'
import { useCreateDocument, useDeleteDocument, useDocuments } from '../../api/hooks/useDocuments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { DocumentEditor } from './DocumentEditor'
import { ClipPreviewPlayer } from './ClipPreviewPlayer'
import { CloseIcon, DocumentIcon, TrashIcon } from '../../components/icons'

/**
 * The persistent, project-scoped document-builder panel docked in `AppShell`
 * as a sibling of the routed page (not nested in `VideoWorkspace`'s own
 * resizable-panel `Group`, so the two panel systems never fight over space).
 * Collapses to a thin toggle rail when closed; stays mounted across
 * navigation so browsing and writing can happen at the same time.
 */
export function DocumentPanel() {
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

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label="Open document panel"
        title="Documents"
        onClick={() => activeProjectId && openPanel(activeProjectId)}
        disabled={!activeProjectId}
        className="flex w-10 shrink-0 items-start justify-center border-l border-slate-200 bg-white py-4 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40"
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
    <div className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <DocumentIcon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-700">Documents</span>
        <button
          type="button"
          aria-label="Close document panel"
          title="Close"
          onClick={close}
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {previewClip && (
        <div className="relative border-b border-slate-100">
          <button
            type="button"
            aria-label="Close preview"
            title="Close preview"
            onClick={() => setPreviewClip(null)}
            className="absolute top-1 right-1 z-10 rounded bg-black/50 p-1 text-white hover:bg-black/70"
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

      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-2">
        <select
          aria-label="Active document"
          value={activeDocumentId ?? ''}
          onChange={(e) => setActiveDocument(e.target.value || null)}
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="" disabled>
            Select a document…
          </option>
          {(documents ?? []).map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>
        {activeDocumentId && (
          <button
            type="button"
            aria-label="Delete document"
            title="Delete document"
            onClick={() => handleDelete(activeDocumentId)}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New document title…"
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
        >
          New
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeProjectId && activeDocumentId ? (
          <DocumentEditor projectId={activeProjectId} documentId={activeDocumentId} />
        ) : (
          <div className="p-6 text-center text-sm text-slate-400">
            {documents?.length === 0
              ? 'No documents yet. Create one above.'
              : 'Select a document to start writing.'}
          </div>
        )}
      </div>
    </div>
  )
}
