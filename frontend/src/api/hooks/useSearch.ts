import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type SearchResult = components['schemas']['SearchResult']

/** Full-text search across a project's transcript text, speakers, and comments. */
export function useSearch(projectId: string, q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: ['search', projectId, query],
    enabled: query.length > 0,
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/search', {
          params: { path: { project_id: projectId }, query: { q: query } },
        }),
      ),
  })
}
