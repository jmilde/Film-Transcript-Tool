import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type TranscriptSummary = components['schemas']['TranscriptSummary']
export type Transcript = components['schemas']['TranscriptRead']
export type Segment = components['schemas']['SegmentRead']
export type Token = components['schemas']['TokenRead']

/** All transcripts (original + translations) available for a video. */
export function useTranscripts(videoId: string) {
  return useQuery({
    queryKey: ['transcripts', videoId],
    queryFn: async () =>
      unwrap(
        await api.GET('/videos/{video_id}/transcripts', {
          params: { path: { video_id: videoId } },
        }),
      ),
  })
}

/** Full transcript detail: segments + tokens. */
export function useTranscript(transcriptId: string | null) {
  return useQuery({
    queryKey: ['transcript', transcriptId],
    enabled: transcriptId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/transcripts/{transcript_id}', {
          params: { path: { transcript_id: transcriptId as string } },
        }),
      ),
  })
}

/** Reassign which speaker is credited for one or more segments
 * (`PATCH /segments/{id}`) — distinct from renaming a speaker
 * (`useUpdateSpeaker`), which changes that speaker's name everywhere they're
 * credited instead. Accepts several segment ids since the transcript view
 * groups consecutive same-speaker segments under one header; reassigning
 * that header's speaker reassigns every segment it visually spans. */
export function useReassignSegmentSpeaker(transcriptId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { segmentIds: string[]; speakerId: string | null }) =>
      Promise.all(
        input.segmentIds.map(async (segmentId) =>
          unwrap(
            await api.PATCH('/segments/{segment_id}', {
              params: { path: { segment_id: segmentId } },
              body: { speaker_id: input.speakerId },
            }),
          ),
        ),
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['transcript', transcriptId] }),
  })
}
