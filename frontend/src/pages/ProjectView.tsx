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
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/Dialog'
import { FileText as DocumentIcon, Plus as PlusIcon, Video as VideoIcon } from 'lucide-react'

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
      {isPending && <p className="text-text-muted">Loading project…</p>}
      {isError && <p className="text-danger-text">Could not load this project.</p>}
      {project && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-h2 text-text">{project.name}</h2>
            {project.description && (
              <p className="mt-0.5 truncate text-small text-text-muted">{project.description}</p>
            )}
            <div className="mt-2 flex items-center gap-4 text-small text-text-muted">
              <span className="flex items-center gap-1.5">
                <VideoIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {project.video_count} videos
              </span>
              <span className="flex items-center gap-1.5">
                <DocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {project.document_count} documents
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MembersPanel projectId={projectId} myRole={project.my_role} />
          </div>
        </div>
      )}

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="New folder">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent title="New folder">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            autoFocus
            aria-label="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            className="w-full"
          />
          <Button
            type="submit"
            disabled={!name.trim() || createFolder.isPending}
            className="w-full"
          >
            {createFolder.isPending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
