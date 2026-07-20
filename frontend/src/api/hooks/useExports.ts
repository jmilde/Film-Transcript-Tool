import { useMutation, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type ExportType = components['schemas']['ExportType']
export type Export = components['schemas']['ExportRead']

/** Request an export of a transcript (`POST /transcripts/{id}/exports`); returns ids to poll/download. */
export function useCreateExport(transcriptId: string) {
  return useMutation({
    mutationFn: async (format: ExportType) =>
      unwrap(
        await api.POST('/transcripts/{transcript_id}/exports', {
          params: { path: { transcript_id: transcriptId } },
          body: { format },
        }),
      ),
  })
}

/** Poll an export's readiness (`GET /exports/{id}`) until the worker has rendered the file. */
export function useExport(exportId: string | null) {
  return useQuery({
    queryKey: ['export', exportId],
    enabled: exportId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/exports/{export_id}', {
          params: { path: { export_id: exportId as string } },
        }),
      ),
    refetchInterval: (query) => (query.state.data?.ready ? false : 1500),
  })
}

/**
 * Download a ready export's file. The endpoint returns the raw file body (not
 * JSON), and needs the same Bearer auth as any other API call, so this fetches
 * it as a blob through the typed client and triggers a save via an object URL
 * rather than linking directly to it like the (token-authorized) media routes.
 */
export function useDownloadExport() {
  return useMutation({
    mutationFn: async ({ exportId, filename }: { exportId: string; filename: string }) => {
      const { data, error } = await api.GET('/exports/{export_id}/content', {
        params: { path: { export_id: exportId } },
        parseAs: 'blob',
      })
      if (error || !data) throw new Error('Download failed')
      const blob = data as Blob
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
  })
}
