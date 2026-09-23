import { describe, expect, it } from 'vitest'
import { chunkTokens } from './chunkTokens'
import type { Token } from '../../api/hooks/useTranscripts'

function token(id: string, start: number, end: number, text = id): Token {
  return {
    id,
    segment_id: 's1',
    original_text: text,
    edited_text: null,
    text,
    start_time: start,
    end_time: end,
    version: 1,
    is_highlighted: false,
  }
}

describe('chunkTokens', () => {
  it('returns nothing for an empty transcript', () => {
    expect(chunkTokens([])).toEqual([])
  })

  it('keeps a short run of tokens in a single chunk', () => {
    const tokens = [token('a', 0, 1, 'Hi.'), token('b', 1, 2, 'there.')]
    expect(chunkTokens(tokens)).toEqual([tokens])
  })

  it('breaks at a sentence boundary once 30s have elapsed', () => {
    const tokens = [
      token('a', 0, 1, 'Hello.'),
      token('b', 31, 32, 'World.'), // 31s in, previous token ends a sentence
      token('c', 32, 33, 'More.'),
    ]
    expect(chunkTokens(tokens)).toEqual([[tokens[0]], [tokens[1], tokens[2]]])
  })

  it('does not break mid-sentence just because 30s elapsed', () => {
    const tokens = [
      token('a', 0, 1, 'Hello'), // no punctuation
      token('b', 31, 32, 'world.'), // 31s in, but previous token has no sentence end
      token('c', 32, 33, 'Next.'),
    ]
    // First boundary candidate is after "world." (ends a sentence) at 32s.
    expect(chunkTokens(tokens)).toEqual([[tokens[0], tokens[1]], [tokens[2]]])
  })

  it('forces a break past the max window even without punctuation', () => {
    const tokens = [
      token('a', 0, 1, 'Hello'),
      token('b', 46, 47, 'world'), // 46s in, still no punctuation anywhere
    ]
    expect(chunkTokens(tokens)).toEqual([[tokens[0]], [tokens[1]]])
  })
})
