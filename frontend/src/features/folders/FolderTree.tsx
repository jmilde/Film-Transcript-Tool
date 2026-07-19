import { useState } from 'react'
import { useFolderContents, useRootFolders, type Folder } from '../../api/hooks/useFolders'

interface TreeProps {
  projectId: string
  selectedFolderId: string | null
  onSelect: (folderId: string) => void
}

/** Nested folder navigation for a project. Each node lazily loads its children. */
export function FolderTree({ projectId, selectedFolderId, onSelect }: TreeProps) {
  const { data: roots, isPending, isError } = useRootFolders(projectId)

  if (isPending) return <p className="px-2 py-1 text-sm text-slate-500">Loading folders…</p>
  if (isError) return <p className="px-2 py-1 text-sm text-red-600">Could not load folders.</p>
  if (roots.length === 0) return <p className="px-2 py-1 text-sm text-slate-500">No folders yet.</p>

  return (
    <ul className="text-sm">
      {roots.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

interface NodeProps {
  folder: Folder
  depth: number
  selectedFolderId: string | null
  onSelect: (folderId: string) => void
}

function FolderTreeNode({ folder, depth, selectedFolderId, onSelect }: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  // Only fetch children once the node is opened.
  const { data } = useFolderContents(expanded ? folder.id : null)
  const isSelected = folder.id === selectedFolderId

  return (
    <li>
      <div
        className={`flex items-center rounded ${isSelected ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((e) => !e)}
          className="w-5 shrink-0 text-slate-400"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex-1 truncate py-1 pr-2 text-left text-slate-700"
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}
