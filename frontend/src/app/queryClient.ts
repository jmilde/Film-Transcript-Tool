import { QueryClient } from '@tanstack/react-query'

// Single Query client. Server state lives here and nowhere else — UI state is
// kept separate (zustand stores), per docs/300_architecture.md.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})
