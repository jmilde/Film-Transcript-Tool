import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Video = components['schemas']['VideoRead']
export type VideoUploadResponse = components['schemas']['VideoUploadResponse']

/** Full video detail (assets + processing jobs). */
export function useVideo(videoId: string | null) {
  return useQuery({
    queryKey: ['video', videoId],
    enabled: videoId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/videos/{video_id}', { params: { path: { video_id: videoId as string } } }),
      ),
  })
}

/**
 * Poll a video's detail (including its processing jobs) while any job is still
 * pending or running. Used to show live upload/processing status; disabled once
 * the pipeline settles.
 */
export function useVideoProcessing(videoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['video', videoId, 'processing'],
    enabled,
    queryFn: async () =>
      unwrap(await api.GET('/videos/{video_id}', { params: { path: { video_id: videoId } } })),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs
      if (!jobs) return 1500
      const active = jobs.some((j) => j.status === 'pending' || j.status === 'running')
      return active ? 1500 : false
    },
  })
}

/** Upload a video (multipart) into a folder; kicks off the processing pipeline. */
export function useUploadVideo(folderId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        await api.POST('/folders/{folder_id}/videos', {
          params: { path: { folder_id: folderId } },
          // openapi-typescript types binary upload fields as `string`; the actual
          // runtime value is a File, which the serializer packs into form data.
          body: { file: file as unknown as string },
          bodySerializer(body) {
            const form = new FormData()
            form.set('file', body.file as unknown as Blob)
            return form
          },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['folder', folderId] }),
  })
}

/** Move a video into a different folder (e.g. drag-and-drop in the folder view). */
export function useMoveVideo() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { videoId: string; folderId: string; fromFolderId: string }) =>
      unwrap(
        await api.PATCH('/videos/{video_id}', {
          params: { path: { video_id: input.videoId } },
          body: { folder_id: input.folderId },
        }),
      ),
    onSuccess: (_data, input) => {
      void client.invalidateQueries({ queryKey: ['folder', input.fromFolderId] })
      void client.invalidateQueries({ queryKey: ['folder', input.folderId] })
    },
  })
}
