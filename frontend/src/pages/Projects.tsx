import { useState, type FormEvent } from 'react'
import { useCreateProject, useProjects } from '../api/hooks/useProjects'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Projects</h2>
        <form onSubmit={onCreate} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={createProject.isPending}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </div>

      {isPending && <p className="text-slate-500">Loading projects…</p>}
      {isError && <p className="text-red-600">Could not load projects.</p>}
      {projects && projects.length === 0 && (
        <p className="text-slate-500">No projects yet. Create your first one above.</p>
      )}
      {projects && projects.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {projects.map((project) => (
            <li key={project.id} className="px-4 py-3">
              <span className="font-medium text-slate-800">{project.name}</span>
              {project.description && (
                <span className="ml-2 text-sm text-slate-500">{project.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
