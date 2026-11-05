import { create } from 'zustand'

/**
 * Local UI state (§17 "Transcript State: selection") for a drag-selected
 * token range within one transcript. Tracked as an anchor/focus token id pair
 * (like a native text selection) rather than resolved text/timecodes, since
 * resolving those requires the transcript data the store doesn't hold.
 */
interface SelectionRange {
  transcriptId: string
  anchorTokenId: string
  focusTokenId: string
}

interface RevealRequest {
  transcriptId: string
  tokenId: string
  /** Bumped on every `reveal` call so re-revealing the same token (e.g.
   * clicking the same comment's timecode twice) still produces a fresh
   * identity for effects watching this value to react to. */
  nonce: number
}

interface SelectionState {
  range: SelectionRange | null
  isSelecting: boolean
  /** A one-off request to scroll a specific token into view — distinct from
   * `range`/`setRange` (which Cmd/Ctrl+A select-all also writes) and from
   * `useCommentsStore`'s `selectedId` (which a plain token click also
   * writes), so a comment-panel "jump to range" click has its own trigger
   * that nothing else can misfire. */
  revealRequest: RevealRequest | null
  start: (transcriptId: string, tokenId: string) => void
  extend: (tokenId: string) => void
  finish: () => void
  clear: () => void
  setRange: (transcriptId: string, anchorTokenId: string, focusTokenId: string) => void
  reveal: (transcriptId: string, tokenId: string) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  range: null,
  isSelecting: false,
  revealRequest: null,
  start: (transcriptId, tokenId) =>
    set({
      range: { transcriptId, anchorTokenId: tokenId, focusTokenId: tokenId },
      isSelecting: true,
    }),
  extend: (tokenId) =>
    set((s) => (s.isSelecting && s.range ? { range: { ...s.range, focusTokenId: tokenId } } : s)),
  finish: () => set({ isSelecting: false }),
  clear: () => set({ range: null, isSelecting: false }),
  // Directly sets a range without entering drag-selection mode — used to
  // jump to and highlight a comment's anchored range from the comments panel.
  setRange: (transcriptId, anchorTokenId, focusTokenId) =>
    set({ range: { transcriptId, anchorTokenId, focusTokenId }, isSelecting: false }),
  reveal: (transcriptId, tokenId) =>
    set((s) => ({
      revealRequest: { transcriptId, tokenId, nonce: (s.revealRequest?.nonce ?? 0) + 1 },
    })),
}))
