import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Video = components['schemas']['VideoRead']
export type VideoUploadResponse = components['schemas']['VideoUploadResponse']
export type VideoStatus = components['schemas']['VideoStatusRead']
export type DuplicateCheck = components['schemas']['DuplicateCheckRead']

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

/** Upload a video (multipart) into a folder; kicks off the processing pipeline.
 * Extracted as a plain function (not just a mutation) so the upload-queue
 * runner (`useUploadRunner`) can call it imperatively for entries whose
 * `folderId` varies per-entry, which a hook bound to one `folderId` can't do. */
export async function uploadVideoFile(folderId: string, file: File): Promise<VideoUploadResponse> {
  return unwrap(
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
  )
}

/** Upload a video (multipart) into a folder; kicks off the processing pipeline. */
export function useUploadVideo(folderId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => uploadVideoFile(folderId, file),
    onSuccess: () => client.invalidateQueries({ queryKey: ['folder', folderId] }),
  })
}

/** Look up whether a folder already has a video matching this filename+size,
 * before transferring the file's bytes. A plain function (like
 * `uploadVideoFile`) since the upload-queue runner calls it imperatively per
 * queue entry rather than from a component's render. */
export async function checkDuplicateVideo(
  folderId: string,
  filename: string,
  size: number,
): Promise<DuplicateCheck> {
  return unwrap(
    await api.GET('/folders/{folder_id}/videos/duplicate-check', {
      params: { path: { folder_id: folderId }, query: { filename, size } },
    }),
  )
}

/**
 * Poll the batch status endpoint for a set of videos' processing jobs while
 * any are still in flight — the upload tray's equivalent of
 * `useVideoProcessing`, generalized from one video to the whole live set in
 * one request. `useVideoProcessing` itself stays as-is for `ProcessingBadge`,
 * a separate single-video call site this doesn't replace.
 */
export function useBatchVideoStatus(videoIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['videos', 'status', [...videoIds].sort()],
    enabled: enabled && videoIds.length > 0,
    queryFn: async () =>
      unwrap(await api.GET('/videos/status', { params: { query: { ids: videoIds.join(',') } } })),
    refetchInterval: 1500,
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
