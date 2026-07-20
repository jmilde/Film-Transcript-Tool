import { describe, expect, it } from 'vitest'
import { findActiveTokenId } from './activeToken'
import type { Segment } from '../../api/hooks/useTranscripts'

function token(id: string, start: number, end: number) {
  return {
    id,
    segment_id: 's1',
    original_text: id,
    edited_text: null,
    text: id,
    start_time: start,
    end_time: end,
  }
}

const segments: Segment[] = [
  { id: 's1', speaker_id: null, tokens: [token('a', 0, 1), token('b', 1, 2)] },
  { id: 's2', speaker_id: null, tokens: [token('c', 5, 6)] },
]

describe('findActiveTokenId', () => {
  it('returns the token containing the current time', () => {
    expect(findActiveTokenId(segments, 0.5)).toBe('a')
    expect(findActiveTokenId(segments, 1.5)).toBe('b')
    expect(findActiveTokenId(segments, 5.2)).toBe('c')
  })

  it('returns the last started token during a gap', () => {
    expect(findActiveTokenId(segments, 3)).toBe('b')
  })

  it('returns null before the first token', () => {
    expect(findActiveTokenId(segments, -1)).toBe(null)
  })

  it('returns null for an empty transcript', () => {
    expect(findActiveTokenId([], 10)).toBe(null)
  })

  it('returns the final token after the transcript ends', () => {
    expect(findActiveTokenId(segments, 100)).toBe('c')
  })
})
