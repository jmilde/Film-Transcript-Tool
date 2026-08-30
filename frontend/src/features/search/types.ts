interface PendingSearchNavBase {
  kind: string
  id: string
  transcriptId: string | null
  startTime: number | null
  /** End of a multi-token range (e.g. a chat citation's chunk span); falls
   * back to `id` when absent, so a single-token hit highlights just itself. */
  endTokenId?: string | null
}

/**
 * Frontend-only payload carried via `navigate(..., { state })` to a video
 * workspace, so it can seek/highlight the clicked hit and offer a "back to
 * origin" affordance (Phase 9's `ReturnToOrigin`). `origin` distinguishes the
 * two places a hit can come from, since only one of them has a URL to return
 * to:
 * - `'search'`: the global search overlay (ADR 0001) has no route of its
 *   own — there's nothing to store beyond the discriminant. "Back to search"
 *   reopens `store/searchOverlay.ts`, which already remembers the last query.
 * - `'chat'`: Chat stayed a dedicated route (ADR 0001), so `returnTo` is a
 *   real pathname to navigate back to.
 */
export type PendingSearchNav =
  | (PendingSearchNavBase & { origin: 'search' })
  | (PendingSearchNavBase & { origin: 'chat'; returnTo: string })
