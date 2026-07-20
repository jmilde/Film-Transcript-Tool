import { useQuery } from '@tanstack/react-query'
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
