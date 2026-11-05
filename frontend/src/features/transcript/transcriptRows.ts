import type { Token } from '../../api/hooks/useTranscripts'
import { chunkTokens } from './chunkTokens'

export interface SpeakerGroup {
  key: string
  speakerId: string | null
  segmentIds: string[]
  tokens: Token[]
}

export type TranscriptRow =
  | {
      kind: 'header'
      key: string
      groupKey: string
      speakerId: string | null
      segmentIds: string[]
      isFirstRow: boolean
    }
  | {
      kind: 'chunk'
      key: string
      groupKey: string
      tokens: Token[]
      startIndex: number
      endIndex: number
      isLastOfGroup: boolean
    }

export interface TranscriptRowsResult {
  rows: TranscriptRow[]
  tokenRowIndex: Map<string, number>
}

/**
 * Flattens speaker groups + `chunkTokens(...)` into one virtualizable row
 * list: one header row per group — even a group with no tokens, matching
 * today's unvirtualized render where the header is a sibling before the
 * chunk map, not folded inside it — followed by that group's chunk rows.
 * `tokenIndex` (token id -> position in `flatTokens`) is reused rather than
 * recomputed, to derive each chunk's start/end index into `flatTokens`.
 */
export function buildTranscriptRows(
  speakerGroups: SpeakerGroup[],
  tokenIndex: Map<string, number>,
): TranscriptRowsResult {
  const rows: TranscriptRow[] = []
  const tokenRowIndex = new Map<string, number>()

  for (const group of speakerGroups) {
    rows.push({
      kind: 'header',
      key: `header-${group.key}`,
      groupKey: group.key,
      speakerId: group.speakerId,
      segmentIds: group.segmentIds,
      isFirstRow: rows.length === 0,
    })
    const chunks = chunkTokens(group.tokens)
    chunks.forEach((chunk, i) => {
      const startIndex = tokenIndex.get(chunk[0].id)
      const endIndex = tokenIndex.get(chunk[chunk.length - 1].id)
      if (startIndex === undefined || endIndex === undefined) return
      const rowIndex = rows.length
      rows.push({
        kind: 'chunk',
        key: chunk[0].id,
        groupKey: group.key,
        tokens: chunk,
        startIndex,
        endIndex,
        isLastOfGroup: i === chunks.length - 1,
      })
      for (const token of chunk) tokenRowIndex.set(token.id, rowIndex)
    })
  }
  return { rows, tokenRowIndex }
}
