import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useSearchGroups } from '../api/hooks/useSearch'
import type { SearchHit } from '../api/hooks/useSearch'
import { SearchVideoGroupCard } from '../features/search/SearchVideoGroupCard'
import type { PendingSearchNav } from '../features/search/types'
import { useDocumentPanelStore } from '../store/documentPanel'

export function SearchPage() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null
  return <SearchPageInner projectId={projectId} />
}

function SearchPageInner({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const setActiveProject = useDocumentPanelStore((s) => s.setActiveProject)
  useEffect(() => setActiveProject(projectId), [projectId, setActiveProject])

  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)

  // Keep the input in sync when the URL changes from outside typing (back/
  // forward navigation, or landing on a shared link) rather than from our own
  // debounced commit below.
  useEffect(() => {
    setInput(q)
  }, [q])

  useEffect(() => {
    const id = setTimeout(() => {
      if (input === q) return
      const next = new URLSearchParams(searchParams)
      if (input.trim()) {
        next.set('q', input)
      } else {
        next.delete('q')
      }
      setSearchParams(next, { replace: true })
    }, 250)
    return () => clearTimeout(id)
  }, [input, q, searchParams, setSearchParams])

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useSearchGroups(
    projectId,
    q,
  )

  const groups = data?.pages.flatMap((page) => page.groups) ?? []

  function handleSelectHit(videoId: string, hit: SearchHit) {
    const nav: PendingSearchNav = {
      kind: hit.kind,
      id: hit.id,
      transcriptId: hit.transcript_id,
      startTime: hit.start_time,
      returnTo: location.pathname + location.search,
    }
    void navigate(`/videos/${videoId}`, { state: nav })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:underline">
          ← Project
        </Link>
        <h2 className="text-lg font-semibold text-slate-800">Search</h2>
      </div>

      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search transcripts, speakers, comments…"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />

      {q.trim() !== '' && isLoading && <p className="text-sm text-slate-400">Searching…</p>}
      {q.trim() !== '' && !isLoading && groups.length === 0 && (
        <p className="text-sm text-slate-400">No results.</p>
      )}

      <div className="space-y-3">
        {groups.map((group) => (
          <SearchVideoGroupCard
            key={group.video_id}
            group={group}
            onSelectHit={(hit) => handleSelectHit(group.video_id, hit)}
          />
        ))}
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
