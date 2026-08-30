import { useState, type DragEvent } from 'react'
import {
  useFolderContents,
  useMoveFolder,
  useRootFolders,
  type Folder,
} from '../../api/hooks/useFolders'
import { useMoveVideo } from '../../api/hooks/useVideos'
import { Folder as FolderIcon } from 'lucide-react'

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
  const [rootDragOver, setRootDragOver] = useState(false)

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
      {roots && roots.length === 0 && (
        <p className="px-2 py-1 text-text-muted">No folders yet.</p>
      )}
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
}

function FolderTreeNode({
  folder,
  depth,
  selectedFolderId,
  onSelect,
  moveFolder,
  moveVideo,
}: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // Fetched eagerly (not gated on `expanded`) so we know whether this folder
  // has subfolders and can hide the expand arrow when it doesn't.
  const { data } = useFolderContents(folder.id)
  const isSelected = folder.id === selectedFolderId
  const hasSubfolders = (data?.folders.length ?? 0) > 0

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
        className={`flex items-center rounded-md ${
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
            onClick={() => setExpanded((e) => !e)}
            className="w-5 shrink-0 text-text-muted"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <FolderIcon className="mr-1 h-4 w-4 shrink-0 text-text-muted" />
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex-1 truncate py-1 pr-2 text-left text-text"
        >
          {folder.name}
        </button>
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}
