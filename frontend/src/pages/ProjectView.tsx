import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useProject } from '../api/hooks/useProjects'
import { useCreateFolder } from '../api/hooks/useFolders'
import { FolderTree } from '../features/folders/FolderTree'
import { FolderPanel } from '../features/folders/FolderPanel'
import { MembersPanel } from '../features/members/MembersPanel'
import { useDocumentPanelStore } from '../store/documentPanel'

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null
  return <ProjectViewInner projectId={projectId} />
}

function ProjectViewInner({ projectId }: { projectId: string }) {
  const { data: project, isPending, isError } = useProject(projectId)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const setActiveProject = useDocumentPanelStore((s) => s.setActiveProject)
  useEffect(() => setActiveProject(projectId), [projectId, setActiveProject])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
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
        <div className="flex shrink-0 items-center gap-2">
          {project && <MembersPanel projectId={projectId} myRole={project.my_role} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Folders
            </span>
            <NewFolder projectId={projectId} parentFolderId={selectedFolderId} />
          </div>
          <FolderTree
            projectId={projectId}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        </aside>

        <section>
          <FolderPanel folderId={selectedFolderId} onSelectFolder={setSelectedFolderId} />
        </section>
      </div>
    </div>
  )
}

/**
 * Creates a folder inside whichever folder is currently selected in the tree
 * (root if none is selected — clicking empty space in the tree deselects).
 * This is the only place folders can be created; the folder panel to the
 * right no longer offers it.
 */
function NewFolder({
  projectId,
  parentFolderId,
}: {
  projectId: string
  parentFolderId: string | null
}) {
  const createFolder = useCreateFolder(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createFolder.mutateAsync({ name: trimmed, parentFolderId })
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="New folder"
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
