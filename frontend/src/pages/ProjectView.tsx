import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useProject } from '../api/hooks/useProjects'
import { useCreateFolder } from '../api/hooks/useFolders'
import { FolderTree } from '../features/folders/FolderTree'
import { FolderPanel } from '../features/folders/FolderPanel'
import { MembersPanel } from '../features/members/MembersPanel'
import { useDocumentPanelStore } from '../store/documentPanel'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

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
          {isPending && <p className="mt-2 text-text-muted">Loading project…</p>}
          {isError && <p className="mt-2 text-danger-text">Could not load this project.</p>}
          {project && (
            <>
              <h2 className="mt-1 text-h2 text-text">{project.name}</h2>
              {project.description && (
                <p className="text-small text-text-muted">{project.description}</p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {project && <MembersPanel projectId={projectId} myRole={project.my_role} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
        <aside className="rounded-md border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-small font-medium tracking-wide text-text-muted uppercase">
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
      <Button
        variant="ghost"
        size="sm"
        aria-label="New folder"
        onClick={() => setOpen(true)}
      >
        +
      </Button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-24"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={createFolder.isPending}>
        Add
      </Button>
    </form>
  )
}
