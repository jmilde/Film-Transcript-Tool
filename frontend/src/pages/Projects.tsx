import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCreateProject, useProjects } from '../api/hooks/useProjects'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function Projects() {
  const { data: projects, isPending, isError } = useProjects()
  const createProject = useCreateProject()
  const [name, setName] = useState('')

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createProject.mutateAsync(trimmed)
    setName('')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 text-text">Projects</h2>
        <form onSubmit={onCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
          />
          <Button type="submit" disabled={createProject.isPending}>
            Create
          </Button>
        </form>
      </div>

      {isPending && <p className="text-text-muted">Loading projects…</p>}
      {isError && <p className="text-danger-text">Could not load projects.</p>}
      {projects && projects.length === 0 && (
        <p className="text-text-muted">No projects yet. Create your first one above.</p>
      )}
      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} variant="airy" tint="brand">
              <Link
                to={`/projects/${project.id}`}
                className="text-h3 text-text hover:underline"
              >
                {project.name}
              </Link>
              {project.description && (
                <p className="mt-1 text-small text-text-muted">{project.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
