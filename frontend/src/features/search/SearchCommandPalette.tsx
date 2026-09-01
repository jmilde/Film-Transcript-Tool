import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { CommandPalette } from '../../components/ui/CommandPalette'
import { useSearchGroups } from '../../api/hooks/useSearch'
import type { SearchHit } from '../../api/hooks/useSearch'
import { SearchVideoGroupCard } from './SearchVideoGroupCard'
import { useSearchOverlayStore } from '../../store/searchOverlay'
import type { PendingSearchNav } from './types'

/**
 * Global search overlay (⌘F, ADR 0001) — the command-palette container from
 * Phase 4, filled with the query input/results ported from the old
 * `SearchPage` route. `projectId` comes from `AppShell` (route params or the
 * current video's project); the palette can't usefully open without one.
 */
export function SearchCommandPalette({ projectId }: { projectId: string | null }) {
  const isOpen = useSearchOverlayStore((s) => s.isOpen)
  const close = useSearchOverlayStore((s) => s.close)
  const storedQuery = useSearchOverlayStore((s) => s.query)
  const setStoredQuery = useSearchOverlayStore((s) => s.setQuery)
  const navigate = useNavigate()
  const [input, setInput] = useState(storedQuery)

  useEffect(() => {
    const id = setTimeout(() => {
      if (input !== storedQuery) setStoredQuery(input)
    }, 250)
    return () => clearTimeout(id)
  }, [input, storedQuery, setStoredQuery])

  // Never search under a placeholder project id — if the overlay is closed
  // or opened with no project in scope, this keeps `useSearchGroups` disabled
  // regardless of leftover query text from a previous session.
  const effectiveQuery = projectId ? storedQuery : ''
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useSearchGroups(
    projectId ?? '',
    effectiveQuery,
  )
  const groups = data?.pages.flatMap((page) => page.groups) ?? []

  function handleSelectHit(videoId: string, hit: SearchHit) {
    const nav: PendingSearchNav = {
      kind: hit.kind,
      id: hit.id,
      transcriptId: hit.transcript_id,
      startTime: hit.start_time,
      origin: 'search',
    }
    close()
    void navigate(`/videos/${videoId}`, { state: nav })
  }

  return (
    <CommandPalette
      open={isOpen && projectId !== null}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      label="Search"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search transcripts, speakers, comments…"
          className="w-full bg-transparent text-body text-text placeholder:text-text-muted outline-none"
        />
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {effectiveQuery.trim() !== '' && isLoading && (
          <p className="text-small text-text-muted">Searching…</p>
        )}
        {effectiveQuery.trim() !== '' && !isLoading && groups.length === 0 && (
          <p className="text-small text-text-muted">No results.</p>
        )}
        {groups.map((group) => (
          <SearchVideoGroupCard
            key={group.video_id}
            group={group}
            onSelectHit={(hit) => handleSelectHit(group.video_id, hit)}
          />
        ))}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-md border border-border px-3 py-1.5 text-small text-text-muted hover:bg-surface-raised disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </CommandPalette>
  )
}
