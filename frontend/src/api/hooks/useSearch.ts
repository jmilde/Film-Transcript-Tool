import { useInfiniteQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type SearchHit = components['schemas']['SearchHitRead']
export type SearchVideoGroup = components['schemas']['SearchVideoGroup']

const PAGE_SIZE = 10

/**
 * Grouped, paginated full-text search across a project's transcript text,
 * speakers, and comments. Results are grouped per video (docs §14); pages are
 * fetched by offset as the caller scrolls/clicks "Load more".
 */
export function useSearchGroups(projectId: string, q: string) {
  const query = q.trim()
  return useInfiniteQuery({
    queryKey: ['search', projectId, query],
    enabled: query.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET('/projects/{project_id}/search', {
          params: {
            path: { project_id: projectId },
            query: { q: query, limit: PAGE_SIZE, offset: pageParam },
          },
        }),
      ),
    getNextPageParam: (lastPage) =>
      lastPage.offset + lastPage.groups.length < lastPage.total_videos
        ? lastPage.offset + lastPage.groups.length
        : undefined,
  })
}
