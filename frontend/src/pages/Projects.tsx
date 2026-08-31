import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCreateProject, useProjects } from '../api/hooks/useProjects'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/Dialog'
import {
  FileText as DocumentIcon,
  Plus as PlusIcon,
  Users as UsersIcon,
  Video as VideoIcon,
} from 'lucide-react'

export function Projects() {
  const { data: projects, isPending, isError } = useProjects()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 text-text">Projects</h2>
        <NewProjectDialog />
      </div>

      {isPending && <p className="text-text-muted">Loading projects…</p>}
      {isError && <p className="text-danger-text">Could not load projects.</p>}
      {projects && projects.length === 0 && (
        <p className="text-text-muted">No projects yet. Create your first one above.</p>
      )}
      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="block">
              <Card
                variant="airy"
                tint="brand"
                className="h-full cursor-pointer transition-shadow hover:shadow-md"
              >
                <h3 className="text-h3 text-text">{project.name}</h3>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-small text-text-muted">
                    {project.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-4 text-small text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <VideoIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.video_count}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.member_count}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.document_count}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function NewProjectDialog() {
  const createProject = useCreateProject()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createProject.mutateAsync({ name: trimmed, description: description.trim() })
    setName('')
    setDescription('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent title="New project">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            autoFocus
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full"
          />
          <Textarea
            aria-label="Project description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full"
          />
          <Button
            type="submit"
            disabled={!name.trim() || createProject.isPending}
            className="w-full"
          >
            {createProject.isPending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
