import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Speaker = components['schemas']['SpeakerRead']

/** Speakers diarized for a video, joined against segments by speaker_id. */
export function useSpeakers(videoId: string) {
  return useQuery({
    queryKey: ['speakers', videoId],
    queryFn: async () =>
      unwrap(
        await api.GET('/videos/{video_id}/speakers', {
          params: { path: { video_id: videoId } },
        }),
      ),
  })
}

/** Rename a speaker (`PATCH /speakers/{id}`) — applies everywhere that
 * speaker is credited, since the name lives on the `Speaker` row itself. */
export function useUpdateSpeaker(videoId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { speakerId: string; name: string }) =>
      unwrap(
        await api.PATCH('/speakers/{speaker_id}', {
          params: { path: { speaker_id: input.speakerId } },
          body: { name: input.name },
        }),
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['speakers', videoId] }),
  })
}
