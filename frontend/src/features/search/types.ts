/**
 * Frontend-only payload carried via `navigate(..., { state })` from the search
 * page to a video workspace, so it can seek/highlight the clicked hit and
 * offer a "back to search" link. `returnTo` is the search page's exact
 * pathname+search at click time, captured so the link restores identical
 * results (same query, same scroll-independent state) rather than a fresh
 * empty search.
 */
export interface PendingSearchNav {
  kind: string
  id: string
  transcriptId: string | null
  startTime: number | null
  returnTo: string
}
