import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useProject } from '../api/hooks/useProjects'
import { useCreateFolder } from '../api/hooks/useFolders'
import { FolderTree } from '../features/folders/FolderTree'
import { FolderPanel } from '../features/folders/FolderPanel'
import { SearchOverlay } from '../features/search/SearchOverlay'
import type { SearchResult } from '../api/hooks/useSearch'

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null
  return <ProjectViewInner projectId={projectId} />
}

function ProjectViewInner({ projectId }: { projectId: string }) {
  const { data: project, isPending, isError } = useProject(projectId)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleSelectResult(result: SearchResult) {
    setSearchOpen(false)
    void navigate(`/videos/${result.video_id}`, { state: result })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:underline">
            ← Projects
          </Link>
          {isPending && <p className="mt-2 text-slate-500">Loading project…</p>}
          {isError && <p className="mt-2 text-red-600">Could not load this project.</p>}
          {project && (
            <>
              <h2 className="mt-1 text-xl font-semibold text-slate-800">{project.name}</h2>
              {project.description && (
                <p className="text-sm text-slate-500">{project.description}</p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Search <span className="text-slate-400">⌘F</span>
        </button>
      </div>

      {searchOpen && (
        <SearchOverlay
          projectId={projectId}
          onClose={() => setSearchOpen(false)}
          onSelect={handleSelectResult}
        />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Folders
            </span>
            <NewRootFolder projectId={projectId} />
          </div>
          <FolderTree
            projectId={projectId}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        </aside>

        <section>
          <FolderPanel
            projectId={projectId}
            folderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
          />
        </section>
      </div>
    </div>
  )
}

function NewRootFolder({ projectId }: { projectId: string }) {
  const createFolder = useCreateFolder(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createFolder.mutateAsync({ name: trimmed, parentFolderId: null })
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="New root folder"
        onClick={() => setOpen(true)}
        className="rounded px-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        +
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
      />
      <button type="submit" disabled={createFolder.isPending} className="text-sm text-slate-700">
        Add
      </button>
    </form>
  )
}
