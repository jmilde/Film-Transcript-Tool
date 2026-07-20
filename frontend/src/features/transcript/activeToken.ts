import type { Segment } from '../../api/hooks/useTranscripts'

/**
 * The token whose time range contains `currentTime`, or — during a gap
 * between tokens (silence, cut) — the most recent token that already
 * started. Returns null before the first token or when there are none.
 */
export function findActiveTokenId(segments: Segment[], currentTime: number): string | null {
  let lastStarted: string | null = null
  for (const segment of segments) {
    for (const token of segment.tokens) {
      if (token.start_time <= currentTime) {
        lastStarted = token.id
        if (currentTime < token.end_time) return token.id
      } else {
        return lastStarted
      }
    }
  }
  return lastStarted
}
