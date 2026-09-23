import type { Token } from '../../api/hooks/useTranscripts'

const TARGET_SECONDS = 30
// Grace window beyond the target before a chunk is forced to break even
// without sentence-ending punctuation (unpunctuated ASR output) — long
// enough to still prefer a sentence boundary, short enough that a wall of
// text never grows unbounded.
const MAX_SECONDS = 45

function endsSentence(text: string): boolean {
  return /[.!?]$/.test(text.trim())
}

/**
 * Splits one speaker group's tokens into readable chunks, each preceded by a
 * timecode label, so a long monologue isn't one uninterrupted wall of text.
 * Prefers to break at a sentence boundary once `TARGET_SECONDS` have elapsed
 * since the chunk started; if no sentence end shows up (unpunctuated ASR
 * output), forces a break once `MAX_SECONDS` have elapsed instead.
 */
export function chunkTokens(tokens: Token[]): Token[][] {
  if (tokens.length === 0) return []
  const chunks: Token[][] = []
  let current: Token[] = [tokens[0]]
  let chunkStart = tokens[0].start_time

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    const previous = tokens[i - 1]
    const elapsed = token.start_time - chunkStart
    const atSentenceBoundary = endsSentence(previous.text)
    if ((elapsed >= TARGET_SECONDS && atSentenceBoundary) || elapsed >= MAX_SECONDS) {
      chunks.push(current)
      current = [token]
      chunkStart = token.start_time
    } else {
      current.push(token)
    }
  }
  chunks.push(current)
  return chunks
}
