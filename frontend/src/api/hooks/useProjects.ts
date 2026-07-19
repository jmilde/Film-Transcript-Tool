import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Project = components['schemas']['ProjectRead']

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => unwrap(await api.GET('/projects')),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}', { params: { path: { project_id: projectId } } }),
      ),
  })
}

export function useCreateProject() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => unwrap(await api.POST('/projects', { body: { name } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['projects'] }),
  })
}
