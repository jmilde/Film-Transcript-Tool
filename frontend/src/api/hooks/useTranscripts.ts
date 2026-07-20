import { useQuery } from '@tanstack/react-query'
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
