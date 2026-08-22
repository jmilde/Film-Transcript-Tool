import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { API_URL } from '../../env'

/** Waveform peaks JSON (served as a raw file, so typed locally). */
export interface Waveform {
  version: number
  sample_rate: number
  peaks: number[]
}

/**
 * Fetch a short-lived signed token for streaming this video's media. A <video>
 * element can't send a Bearer header, so the proxy stream is authorized by this
 * token as a query param instead. Refreshed well before its ~1h expiry.
 */
export function useMediaToken(videoId: string) {
  return useQuery({
    queryKey: ['media-token', videoId],
    staleTime: 50 * 60 * 1000,
    queryFn: async () =>
      unwrap(
        await api.GET('/videos/{video_id}/media-token', {
          params: { path: { video_id: videoId } },
        }),
      ),
  })
}

/** Build the authenticated proxy-stream URL for a <video src>. */
export function proxyUrl(videoId: string, token: string): string {
  return `${API_URL}/videos/${videoId}/proxy?token=${encodeURIComponent(token)}`
}

/** Build the authenticated thumbnail URL for an <img src>. */
export function thumbnailUrl(videoId: string, token: string): string {
  return `${API_URL}/videos/${videoId}/thumbnail?token=${encodeURIComponent(token)}`
}

/** Precomputed waveform peaks for the timeline; absent (404) until generated. */
export function useWaveform(videoId: string) {
  return useQuery({
    queryKey: ['waveform', videoId],
    retry: false,
    queryFn: async () => {
      const result = await api.GET('/videos/{video_id}/waveform', {
        params: { path: { video_id: videoId } },
      })
      return unwrap(result) as Waveform
    },
  })
}
