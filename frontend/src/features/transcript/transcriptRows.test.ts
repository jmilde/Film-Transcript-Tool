import { describe, expect, it } from 'vitest'
import { buildTranscriptRows, type SpeakerGroup } from './transcriptRows'
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
    is_highlighted: false,
  }
}

function tokenIndexOf(tokens: Token[]): Map<string, number> {
  const map = new Map<string, number>()
  tokens.forEach((t, i) => map.set(t.id, i))
  return map
}

describe('buildTranscriptRows', () => {
  it('keeps a header row for a group with no tokens', () => {
    const groups: SpeakerGroup[] = [
      { key: 'g1', speakerId: 'spk-1', segmentIds: ['seg-1'], tokens: [] },
    ]
    const { rows, tokenRowIndex } = buildTranscriptRows(groups, new Map())
    expect(rows).toEqual([
      {
        kind: 'header',
        key: 'header-g1',
        groupKey: 'g1',
        speakerId: 'spk-1',
        segmentIds: ['seg-1'],
        isFirstRow: true,
      },
    ])
    expect(tokenRowIndex.size).toBe(0)
  })

  it('emits one chunk row for a group that fits in a single chunk', () => {
    const tokens = [token('a', 0, 1, 'Hi.'), token('b', 1, 2, 'there.')]
    const groups: SpeakerGroup[] = [
      { key: 'g1', speakerId: 'spk-1', segmentIds: ['seg-1'], tokens },
    ]
    const { rows, tokenRowIndex } = buildTranscriptRows(groups, tokenIndexOf(tokens))

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'header', isFirstRow: true })
    expect(rows[1]).toMatchObject({
      kind: 'chunk',
      key: 'a',
      startIndex: 0,
      endIndex: 1,
      isLastOfGroup: true,
    })
    expect(tokenRowIndex.get('a')).toBe(1)
    expect(tokenRowIndex.get('b')).toBe(1)
  })

  it('emits one row per chunk for a group that splits into several', () => {
    const tokens = [
      token('a', 0, 1, 'Hello.'),
      token('b', 31, 32, 'World.'), // 31s in, forces a new chunk at a sentence boundary
      token('c', 32, 33, 'More.'),
    ]
    const groups: SpeakerGroup[] = [
      { key: 'g1', speakerId: 'spk-1', segmentIds: ['seg-1'], tokens },
    ]
    const { rows, tokenRowIndex } = buildTranscriptRows(groups, tokenIndexOf(tokens))

    const chunkRows = rows.filter((r) => r.kind === 'chunk')
    expect(chunkRows).toHaveLength(2)
    expect(chunkRows[0]).toMatchObject({ startIndex: 0, endIndex: 0, isLastOfGroup: false })
    expect(chunkRows[1]).toMatchObject({ startIndex: 1, endIndex: 2, isLastOfGroup: true })
    expect(tokenRowIndex.get('a')).toBe(rows.indexOf(chunkRows[0]))
    expect(tokenRowIndex.get('b')).toBe(rows.indexOf(chunkRows[1]))
    expect(tokenRowIndex.get('c')).toBe(rows.indexOf(chunkRows[1]))
  })

  it('resolves every token across multiple groups to its row', () => {
    const tokensA = [token('a', 0, 1)]
    const tokensB = [token('b', 1, 2)]
    const groups: SpeakerGroup[] = [
      { key: 'g1', speakerId: 'spk-1', segmentIds: ['seg-1'], tokens: tokensA },
      { key: 'g2', speakerId: 'spk-2', segmentIds: ['seg-2'], tokens: tokensB },
    ]
    const tokenIndex = tokenIndexOf([...tokensA, ...tokensB])
    const { rows, tokenRowIndex } = buildTranscriptRows(groups, tokenIndex)

    expect(rows.map((r) => r.kind)).toEqual(['header', 'chunk', 'header', 'chunk'])
    expect(rows[2]).toMatchObject({ kind: 'header', isFirstRow: false })
    expect(tokenRowIndex.get('a')).toBe(1)
    expect(tokenRowIndex.get('b')).toBe(3)
  })
})
