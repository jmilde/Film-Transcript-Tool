import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  useCreateDocument,
  useUpdateDocument,
  type DocumentSummary,
} from '../../api/hooks/useDocuments'
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
import {
  ChevronDown as OptionsIcon,
  Pencil as RenameIcon,
  Plus as PlusIcon,
  Trash2 as TrashIcon,
  X as CloseIcon,
} from 'lucide-react'

interface DocumentTabStripProps {
  projectId: string
  documents: DocumentSummary[] | undefined
  openDocumentIds: string[]
  activeDocumentId: string | null
  onActivate: (documentId: string) => void
  onClose: (documentId: string) => void
  onDelete: (documentId: string) => void
  /** Rendered before the tabs, inside the same bordered/bg header row — e.g.
   * `DocumentPage`'s back button — so it reads as part of one unified header
   * rather than a separate element that offsets the tabs from the box below. */
  leading?: ReactNode
}

/**
 * The tab strip shared by the docked `DocumentPanel` and the fullscreen
 * `DocumentPage` — which documents are open and which one is active both
 * live in `store/documentPanel.ts`, so both surfaces show the same tabs;
 * only what "activate" does differs (switch the panel's active tab vs.
 * navigate to that document's own URL), which is why it's a callback prop
 * rather than baked in here.
 */
export function DocumentTabStrip({
  projectId,
  documents,
  openDocumentIds,
  activeDocumentId,
  onActivate,
  onClose,
  onDelete,
  leading,
}: DocumentTabStripProps) {
  const openDocs = openDocumentIds
    .map((id) => documents?.find((doc) => doc.id === id))
    .filter((doc): doc is DocumentSummary => doc !== undefined)
  const otherDocs = (documents ?? []).filter((doc) => !openDocumentIds.includes(doc.id))

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-raised px-2 pt-1.5">
      {leading && <div className="mb-1.5 flex shrink-0 items-center">{leading}</div>}
      {openDocs.map((doc) => (
        <DocumentTab
          key={doc.id}
          doc={doc}
          projectId={projectId}
          isActive={doc.id === activeDocumentId}
          onActivate={() => onActivate(doc.id)}
          onClose={() => onClose(doc.id)}
          onDelete={() => onDelete(doc.id)}
        />
      ))}
      <ExistingDocumentPicker docs={otherDocs} onPick={onActivate} />
      <div className="mb-1.5 ml-auto flex shrink-0 items-center gap-1">
        <NewDocumentDialog projectId={projectId} onCreated={onActivate} />
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
      className={`group relative -mb-px flex shrink-0 items-center gap-0.5 rounded-t-md border py-1 pr-0.5 pl-2 text-small ${
        isActive
          ? 'border-border border-b-surface bg-surface text-text'
          : 'border-transparent text-text-muted hover:bg-surface'
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

/** The tab strip's "+" — styled as its own tab-shaped header slot right
 * after the open tabs (like a browser's "new tab" button), rather than a
 * plain icon button off to the side. Opens one of the project's other
 * documents (not already open) as a new tab. */
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
          className="-mb-px flex shrink-0 items-center justify-center rounded-t-md border border-border border-b-transparent bg-surface px-2 py-1.5 text-text-muted hover:text-text"
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
}: {
  projectId: string
  onCreated: (documentId: string) => void
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
          variant="primary"
          size="sm"
          aria-label="New document"
          title="New document"
          className="shrink-0"
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
