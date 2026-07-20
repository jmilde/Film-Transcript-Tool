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

interface SelectionState {
  range: SelectionRange | null
  isSelecting: boolean
  start: (transcriptId: string, tokenId: string) => void
  extend: (tokenId: string) => void
  finish: () => void
  clear: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  range: null,
  isSelecting: false,
  start: (transcriptId, tokenId) =>
    set({
      range: { transcriptId, anchorTokenId: tokenId, focusTokenId: tokenId },
      isSelecting: true,
    }),
  extend: (tokenId) =>
    set((s) => (s.isSelecting && s.range ? { range: { ...s.range, focusTokenId: tokenId } } : s)),
  finish: () => set({ isSelecting: false }),
  clear: () => set({ range: null, isSelecting: false }),
}))
