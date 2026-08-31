import { create } from 'zustand'

/**
 * Local UI state (§17 "Comment State") for the comments panel: which reply
 * threads are expanded, and which comment is currently focused (e.g. via its
 * timecode, which also locates its range in the transcript/player).
 *
 * `hoveredId` is separate from `selectedId` (not a stand-in for it) so
 * hovering a commented span/clip can preview+highlight it without disturbing
 * whatever's actually selected/pinned — consumers generally want
 * `hoveredId ?? selectedId` as "what to highlight right now".
 */
interface CommentsState {
  openIds: Set<string>
  selectedId: string | null
  hoveredId: string | null
  toggleOpen: (id: string) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
}

export const useCommentsStore = create<CommentsState>((set) => ({
  openIds: new Set(),
  selectedId: null,
  hoveredId: null,
  toggleOpen: (id) =>
    set((s) => {
      const next = new Set(s.openIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { openIds: next }
    }),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
}))
