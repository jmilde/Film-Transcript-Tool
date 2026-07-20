import { useEffect, useState } from 'react'
import { useSearch } from '../../api/hooks/useSearch'
import { formatTime } from '../player/format'
import type { SearchResult } from '../../api/hooks/useSearch'

interface SearchOverlayProps {
  projectId: string
  onClose: () => void
  onSelect: (result: SearchResult) => void
}

const KIND_LABEL: Record<string, string> = {
  transcript: 'Transcript',
  speaker: 'Speaker',
  comment: 'Comment',
}

/**
 * Ctrl/Cmd+F search overlay (docs §14): a query box over a project's
 * transcript text, speakers, and comments, with a debounced query so typing
 * doesn't fire a request per keystroke. Each result shows its matched text as
 * the "context preview" — the API returns only the matched token/comment/
 * speaker text, not surrounding words, so that's the fullest context available.
 */
export function SearchOverlay({ projectId, onClose, onSelect }: SearchOverlayProps) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setQuery(input), 250)
    return () => clearTimeout(id)
  }, [input])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const { data: results, isFetching } = useSearch(projectId, query)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search transcripts, speakers, comments…"
          className="w-full border-b border-slate-200 px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-96 overflow-y-auto">
          {isFetching && <div className="px-4 py-3 text-sm text-slate-400">Searching…</div>}
          {!isFetching && query !== '' && (!results || results.length === 0) && (
            <div className="px-4 py-3 text-sm text-slate-400">No results.</div>
          )}
          {!isFetching &&
            results?.map((result) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                onClick={() => onSelect(result)}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
              >
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                  {KIND_LABEL[result.kind] ?? result.kind}
                </span>
                <span className="flex-1 truncate text-slate-800">{result.text}</span>
                {result.start_time !== null && (
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {formatTime(result.start_time)}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
