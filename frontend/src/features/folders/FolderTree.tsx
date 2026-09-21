import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  folderContentsQuery,
  useDeleteFolder,
  useFolderContents,
  useMoveFolder,
  useRenameFolder,
  useRootFolders,
  type Folder,
} from '../../api/hooks/useFolders'
import { useMoveVideo } from '../../api/hooks/useVideos'
import { useFolderTreeStore } from '../../store/folderTree'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/DropdownMenu'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import {
  Folder as FolderIcon,
  MoreVertical as OptionsIcon,
  Pencil as RenameIcon,
  Trash2 as TrashIcon,
} from 'lucide-react'

// Custom MIME types used to identify what's being dragged, since native HTML5
// drag-and-drop only exposes payloads (not types) on drop, not dragover.
const FOLDER_DND_TYPE = 'application/x-doculog-folder'
export const VIDEO_DND_TYPE = 'application/x-doculog-videos'

interface FolderDragPayload {
  folderId: string
  fromParentId: string | null
}

interface VideoDragPayload {
  videoIds: string[]
  fromFolderId: string
}

interface TreeProps {
  projectId: string
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
}

/** Nested folder navigation for a project. Each node lazily loads its children.
 *
 * The only place folders can be created or reparented — clicking empty space
 * deselects (so "New folder" targets the project root), and folders/videos can
 * be dropped here to move them.
 */
export function FolderTree({ projectId, selectedFolderId, onSelect }: TreeProps) {
  const { data: roots, isPending, isError } = useRootFolders(projectId)
  const moveFolder = useMoveFolder(projectId)
  const moveVideo = useMoveVideo()
  const renameFolder = useRenameFolder(projectId)
  const deleteFolder = useDeleteFolder(projectId)
  const [rootDragOver, setRootDragOver] = useState(false)
  const expandFolders = useFolderTreeStore((s) => s.expand)
  const client = useQueryClient()

  // Whenever the selected folder changes, walk its parent_folder_id chain up
  // to the root and force every ancestor open, so the tree always reveals
  // where the current selection lives even if the user had collapsed it.
  useEffect(() => {
    if (!selectedFolderId) return
    let cancelled = false
    async function walkUp() {
      const ancestors: string[] = []
      let currentId: string | null = selectedFolderId
      while (currentId) {
        const data = await client.fetchQuery(folderContentsQuery(currentId))
        currentId = data.folder.parent_folder_id
        if (currentId) ancestors.push(currentId)
      }
      if (!cancelled && ancestors.length > 0) expandFolders(ancestors)
    }
    void walkUp()
    return () => {
      cancelled = true
    }
  }, [selectedFolderId, client, expandFolders])

  function handleRootDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(FOLDER_DND_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setRootDragOver(true)
  }

  function handleRootDrop(e: DragEvent) {
    e.preventDefault()
    setRootDragOver(false)
    const raw = e.dataTransfer.getData(FOLDER_DND_TYPE)
    if (!raw) return
    const payload = JSON.parse(raw) as FolderDragPayload
    if (payload.fromParentId !== null) {
      moveFolder.mutate({
        folderId: payload.folderId,
        fromParentId: payload.fromParentId,
        toParentId: null,
      })
    }
  }

  return (
    <div
      className={`min-h-16 rounded-md text-body ${rootDragOver ? 'bg-brand-subtle ring-1 ring-inset ring-brand' : ''}`}
      onClick={() => onSelect(null)}
      onDragOver={handleRootDragOver}
      onDragLeave={() => setRootDragOver(false)}
      onDrop={handleRootDrop}
    >
      {isPending && <p className="px-2 py-1 text-text-muted">Loading folders…</p>}
      {isError && <p className="px-2 py-1 text-danger-text">Could not load folders.</p>}
      {roots && roots.length === 0 && <p className="px-2 py-1 text-text-muted">No folders yet.</p>}
      {roots && roots.length > 0 && (
        <ul>
          {roots.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              moveFolder={moveFolder}
              moveVideo={moveVideo}
              renameFolder={renameFolder}
              deleteFolder={deleteFolder}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface NodeProps {
  folder: Folder
  depth: number
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
  moveFolder: ReturnType<typeof useMoveFolder>
  moveVideo: ReturnType<typeof useMoveVideo>
  renameFolder: ReturnType<typeof useRenameFolder>
  deleteFolder: ReturnType<typeof useDeleteFolder>
}

function FolderTreeNode({
  folder,
  depth,
  selectedFolderId,
  onSelect,
  moveFolder,
  moveVideo,
  renameFolder,
  deleteFolder,
}: NodeProps) {
  const collapsed = useFolderTreeStore((s) => s.collapsedIds.includes(folder.id))
  const toggleExpanded = useFolderTreeStore((s) => s.toggle)
  const expanded = !collapsed
  const [dragOver, setDragOver] = useState(false)
  // Fetched eagerly (not gated on `expanded`) so we know whether this folder
  // has subfolders and can hide the expand arrow when it doesn't.
  const { data } = useFolderContents(folder.id)
  const isSelected = folder.id === selectedFolderId
  const hasSubfolders = (data?.folders.length ?? 0) > 0

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(folder.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Same "suppress Radix's return-focus-to-trigger" escape hatch used by
  // DocumentTabStrip's rename flow — without it, closing the dropdown steals
  // focus back from the rename input before the user can type anything.
  const suppressCloseFocusRef = useRef(false)

  useEffect(() => {
    if (!renaming) {
      setName(folder.name)
      return
    }
    const id = setTimeout(() => renameInputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [folder.name, renaming])

  function commitRename() {
    setRenaming(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === folder.name) {
      setName(folder.name)
      return
    }
    renameFolder.mutate({
      folderId: folder.id,
      parentFolderId: folder.parent_folder_id,
      name: trimmed,
    })
  }

  function confirmDelete() {
    setConfirmingDelete(false)
    deleteFolder.mutate(
      { folderId: folder.id, parentFolderId: folder.parent_folder_id },
      {
        onSuccess: () => {
          if (isSelected) onSelect(folder.parent_folder_id)
        },
      },
    )
  }

  function handleDragStart(e: DragEvent) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    const payload: FolderDragPayload = {
      folderId: folder.id,
      fromParentId: folder.parent_folder_id,
    }
    e.dataTransfer.setData(FOLDER_DND_TYPE, JSON.stringify(payload))
  }

  function handleDragOver(e: DragEvent) {
    if (
      !e.dataTransfer.types.includes(FOLDER_DND_TYPE) &&
      !e.dataTransfer.types.includes(VIDEO_DND_TYPE)
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const folderRaw = e.dataTransfer.getData(FOLDER_DND_TYPE)
    if (folderRaw) {
      const payload = JSON.parse(folderRaw) as FolderDragPayload
      if (payload.folderId !== folder.id) {
        moveFolder.mutate({
          folderId: payload.folderId,
          fromParentId: payload.fromParentId,
          toParentId: folder.id,
        })
      }
      return
    }

    const videoRaw = e.dataTransfer.getData(VIDEO_DND_TYPE)
    if (videoRaw) {
      const payload = JSON.parse(videoRaw) as VideoDragPayload
      if (payload.fromFolderId !== folder.id) {
        for (const videoId of payload.videoIds) {
          moveVideo.mutate({ videoId, folderId: folder.id, fromFolderId: payload.fromFolderId })
        }
      }
    }
  }

  return (
    <li>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={(e) => e.stopPropagation()}
        className={`group flex items-center rounded-md ${
          isSelected
            ? 'bg-brand-subtle'
            : dragOver
              ? 'bg-surface-raised ring-1 ring-inset ring-brand'
              : 'hover:bg-surface-raised'
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        {hasSubfolders ? (
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={() => toggleExpanded(folder.id)}
            className="w-5 shrink-0 text-text-muted"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <FolderIcon className="mr-1 h-4 w-4 shrink-0 text-text-muted" />
        {renaming ? (
          <input
            ref={renameInputRef}
            aria-label={`Rename ${folder.name}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setName(folder.name)
                setRenaming(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="my-0.5 min-w-0 flex-1 rounded-sm border border-brand bg-surface px-1 text-text"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(folder.id)}
            className="flex-1 truncate py-1 pr-2 text-left text-text"
          >
            {folder.name}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${folder.name} options`}
            title="Options"
            onClick={(e) => e.stopPropagation()}
            className="mr-1 shrink-0 rounded p-0.5 text-text-muted opacity-0 hover:bg-surface hover:text-text focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <OptionsIcon className="h-3.5 w-3.5" aria-hidden="true" />
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
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && data && data.folders.length > 0 && (
        <ul>
          {data.folders.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              moveFolder={moveFolder}
              moveVideo={moveVideo}
              renameFolder={renameFolder}
              deleteFolder={deleteFolder}
            />
          ))}
        </ul>
      )}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent
          title={`Delete "${folder.name}"?`}
          description={
            (data?.folders.length ?? 0) > 0 || (data?.videos.length ?? 0) > 0
              ? `This also permanently deletes ${data?.folders.length ?? 0} subfolder(s) and ${data?.videos.length ?? 0} video(s) inside it, including their transcripts. This cannot be undone.`
              : 'This cannot be undone.'
          }
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}
