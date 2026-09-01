import { create } from 'zustand'

/**
 * UI state for the global search command palette (⌘F, ADR 0001) — session
 * only, no persistence middleware. Deliberately holds no results: TanStack
 * Query already caches `useSearchGroups` by `['search', projectId, query]`,
 * so reopening with the same `query` restores the same results for free.
 */
interface SearchOverlayState {
  isOpen: boolean
  query: string
  open: () => void
  close: () => void
  setQuery: (query: string) => void
}

export const useSearchOverlayStore = create<SearchOverlayState>((set) => ({
  isOpen: false,
  query: '',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setQuery: (query) => set({ query }),
}))
