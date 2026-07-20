import { create } from 'zustand'

/**
 * Local UI state (§17 "Comment State") for the comments panel: which reply
 * threads are expanded, and which comment is currently focused (e.g. via its
 * timecode, which also locates its range in the transcript/player).
 */
interface CommentsState {
  openIds: Set<string>
  selectedId: string | null
  toggleOpen: (id: string) => void
  select: (id: string | null) => void
}

export const useCommentsStore = create<CommentsState>((set) => ({
  openIds: new Set(),
  selectedId: null,
  toggleOpen: (id) =>
    set((s) => {
      const next = new Set(s.openIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { openIds: next }
    }),
  select: (id) => set({ selectedId: id }),
}))
