import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { RefObject } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
  useCreateDocument,
  useDeleteDocument,
  useDocuments,
  useUpdateDocument,
  type DocumentSummary,
} from '../../api/hooks/useDocuments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { DocumentEditor } from './DocumentEditor'
import { ClipPreviewPlayer } from './ClipPreviewPlayer'
import {
  ChevronDown as OptionsIcon,
  Expand as ExpandIcon,
  FileText as DocumentIcon,
  Pencil as RenameIcon,
  Plus as PlusIcon,
  Trash2 as TrashIcon,
  X as CloseIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '../../components/ui/Dialog'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/DropdownMenu'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

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

  const openDocs = openDocumentIds
    .map((id) => documents?.find((doc) => doc.id === id))
    .filter((doc): doc is DocumentSummary => doc !== undefined)
  const otherDocs = (documents ?? []).filter((doc) => !openDocumentIds.includes(doc.id))

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

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {openDocs.map((doc) => (
          <DocumentTab
            key={doc.id}
            doc={doc}
            projectId={activeProjectId ?? ''}
            isActive={doc.id === activeDocumentId}
            onActivate={() => openTab(doc.id)}
            onClose={() => closeTab(doc.id)}
            onDelete={() => handleDelete(doc.id)}
          />
        ))}
        {activeProjectId && (
          <>
            <ExistingDocumentPicker docs={otherDocs} onPick={openTab} />
            <NewDocumentDialog
              projectId={activeProjectId}
              onCreated={openTab}
              className="ml-auto"
            />
          </>
        )}
      </div>

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

/** One tab: click to activate, hover for a rename/delete menu and a close
 * button. Renaming edits the tab's own label inline rather than opening a
 * separate dialog — `doc.version` (carried on the list-view summary) is
 * enough for the title-only PATCH without loading the document's content. */
function DocumentTab({
  doc,
  projectId,
  isActive,
  onActivate,
  onClose,
  onDelete,
}: {
  doc: DocumentSummary
  projectId: string
  isActive: boolean
  onActivate: () => void
  onClose: () => void
  onDelete: () => void
}) {
  const updateDocument = useUpdateDocument(projectId, doc.id)
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Radix returns focus to the dropdown's trigger when it closes; without
  // suppressing that here, it steals focus right back from the rename
  // input, firing its `onBlur`-commit before the user can type anything.
  // Only suppressed for this one close, right after Rename was selected — a
  // dismiss via Escape/outside-click still returns focus normally.
  const suppressCloseFocusRef = useRef(false)

  useEffect(() => {
    if (!renaming) {
      setTitle(doc.title)
      return
    }
    // Focusing here (a passive effect, run after the browser's own
    // click-driven focus handling has settled) rather than via the input's
    // `autoFocus` attribute avoids a race where the *same* click that
    // selected "Rename" — whose mouseup/click phase is still in flight —
    // would otherwise focus-then-immediately-blur an `autoFocus`ed input
    // mounted synchronously inside that click's own event handler.
    const id = setTimeout(() => renameInputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [doc.title, renaming])

  function commitRename() {
    setRenaming(false)
    const trimmed = title.trim()
    if (!trimmed || trimmed === doc.title) {
      setTitle(doc.title)
      return
    }
    updateDocument.mutate({ title: trimmed, expectedVersion: doc.version })
  }

  return (
    <div
      className={`group flex shrink-0 items-center gap-0.5 rounded-md py-1 pr-0.5 pl-2 text-small ${
        isActive ? 'bg-brand-subtle text-brand-text' : 'text-text-muted hover:bg-surface-raised'
      }`}
    >
      {renaming ? (
        <input
          ref={renameInputRef}
          aria-label={`Rename ${doc.title}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setTitle(doc.title)
              setRenaming(false)
            }
          }}
          className="w-24 rounded-sm border border-brand bg-surface px-1 text-text"
        />
      ) : (
        <button type="button" onClick={onActivate} className="max-w-28 truncate py-0.5">
          {doc.title}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${doc.title} options`}
          title="Options"
          className="rounded p-0.5 opacity-0 hover:bg-surface-raised group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <OptionsIcon className="h-3 w-3" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(e) => {
            if (!suppressCloseFocusRef.current) return
            suppressCloseFocusRef.current = false
            e.preventDefault()
          }}
        >
          <DropdownMenuItem
            onSelect={() => void navigate(`/projects/${projectId}/documents/${doc.id}`)}
          >
            <ExpandIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Open fullscreen
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              suppressCloseFocusRef.current = true
              setRenaming(true)
            }}
          >
            <RenameIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label={`Close ${doc.title}`}
        title="Close"
        onClick={onClose}
        className="rounded p-0.5 opacity-0 hover:bg-surface-raised group-hover:opacity-100"
      >
        <CloseIcon className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
}

/** The tab strip's "+" — opens one of the project's other documents (not
 * already open) as a new tab. */
function ExistingDocumentPicker({
  docs,
  onPick,
}: {
  docs: DocumentSummary[]
  onPick: (documentId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open existing document"
          title="Open existing document"
          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {docs.length === 0 ? (
          <p className="px-2 py-1.5 text-small text-text-muted">
            No other documents in this project.
          </p>
        ) : (
          <ul>
            {docs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(doc.id)
                    setOpen(false)
                  }}
                  className="w-full truncate rounded-md px-2 py-1.5 text-left text-small text-text hover:bg-surface"
                >
                  {doc.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** A separate, small "New document" entry point — a button that pops open a
 * dialog to name the document, rather than a persistent title-input row. */
function NewDocumentDialog({
  projectId,
  onCreated,
  className = '',
}: {
  projectId: string
  onCreated: (documentId: string) => void
  className?: string
}) {
  const createDocument = useCreateDocument(projectId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const doc = await createDocument.mutateAsync(title.trim() || 'Untitled document')
    onCreated(doc.id)
    setTitle('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="New document"
          title="New document"
          className={`shrink-0 ${className}`}
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          New
        </Button>
      </DialogTrigger>
      <DialogContent title="New document">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            autoFocus
            aria-label="Document title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled document"
            className="w-full"
          />
          <Button type="submit" disabled={createDocument.isPending} className="w-full">
            {createDocument.isPending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
