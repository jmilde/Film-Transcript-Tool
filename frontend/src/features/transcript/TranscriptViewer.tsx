import { useEffect, useMemo, useRef } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import { findActiveTokenId } from './activeToken'
import { formatTime } from '../player/format'
import type { Speaker } from '../../api/hooks/useSpeakers'
import type { Token, Transcript } from '../../api/hooks/useTranscripts'

interface TranscriptViewerProps {
  transcript: Transcript | undefined
  speakers: Speaker[] | undefined
  isLoading: boolean
  onSeekToken: (seconds: number) => void
  onPlaySelection: (startTime: number, endTime: number) => void
}

/**
 * Renders a transcript's segments/speakers/tokens, highlighting the token
 * matching the current playback time and (when auto-follow is on) scrolling
 * it into view. Clicking a token seeks the video there; dragging across
 * tokens selects a range, showing its text/timecodes and play/copy actions.
 */
export function TranscriptViewer({
  transcript,
  speakers,
  isLoading,
  onSeekToken,
  onPlaySelection,
}: TranscriptViewerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const autoFollow = usePlaybackStore((s) => s.autoFollow)
  const setAutoFollow = usePlaybackStore((s) => s.setAutoFollow)

  const selectionRange = useSelectionStore((s) => s.range)
  const startSelection = useSelectionStore((s) => s.start)
  const extendSelection = useSelectionStore((s) => s.extend)
  const finishSelection = useSelectionStore((s) => s.finish)
  const clearSelection = useSelectionStore((s) => s.clear)

  const speakerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const speaker of speakers ?? []) {
      map.set(speaker.id, speaker.name ?? 'Unknown speaker')
    }
    return map
  }, [speakers])

  const activeTokenId = useMemo(
    () => (transcript ? findActiveTokenId(transcript.segments, currentTime) : null),
    [transcript, currentTime],
  )

  const flatTokens = useMemo<Token[]>(
    () => transcript?.segments.flatMap((segment) => segment.tokens) ?? [],
    [transcript],
  )
  const tokenIndex = useMemo(() => {
    const map = new Map<string, number>()
    flatTokens.forEach((token, i) => map.set(token.id, i))
    return map
  }, [flatTokens])

  const selectedIds = useMemo(() => {
    if (!transcript || !selectionRange || selectionRange.transcriptId !== transcript.id) {
      return new Set<string>()
    }
    const a = tokenIndex.get(selectionRange.anchorTokenId)
    const b = tokenIndex.get(selectionRange.focusTokenId)
    if (a === undefined || b === undefined) return new Set<string>()
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    return new Set(flatTokens.slice(lo, hi + 1).map((t) => t.id))
  }, [transcript, selectionRange, tokenIndex, flatTokens])

  const selectionInfo = useMemo(() => {
    if (selectedIds.size < 2) return null
    const selected = flatTokens.filter((t) => selectedIds.has(t.id))
    return {
      text: selected.map((t) => t.text).join(' '),
      startTime: selected[0].start_time,
      endTime: selected[selected.length - 1].end_time,
    }
  }, [selectedIds, flatTokens])

  // Tracks the drag gesture: a plain click (no movement onto another token)
  // seeks; movement onto a second token starts a range selection instead.
  const dragAnchorRef = useRef<Token | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    function handleMouseUp() {
      if (draggingRef.current) {
        finishSelection()
      } else if (dragAnchorRef.current) {
        onSeekToken(dragAnchorRef.current.start_time)
        clearSelection()
      }
      dragAnchorRef.current = null
      draggingRef.current = false
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [onSeekToken, finishSelection, clearSelection])

  const activeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (autoFollow) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeTokenId, autoFollow])

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading transcript…</div>
  }

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">No transcript available yet.</div>
    )
  }

  function handleTokenMouseDown(token: Token) {
    dragAnchorRef.current = token
    draggingRef.current = false
  }

  function handleTokenMouseEnter(token: Token) {
    if (!dragAnchorRef.current || !transcript) return
    if (!draggingRef.current) {
      if (token.id === dragAnchorRef.current.id) return
      draggingRef.current = true
      startSelection(transcript.id, dragAnchorRef.current.id)
    }
    extendSelection(token.id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => setAutoFollow(e.target.checked)}
          />
          Auto-follow
        </label>
      </div>

      {selectionInfo && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-slate-600">
          <span className="font-mono">
            {formatTime(selectionInfo.startTime)} – {formatTime(selectionInfo.endTime)}
          </span>
          <span className="max-w-xs truncate italic">"{selectionInfo.text}"</span>
          <button
            type="button"
            className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
            onClick={() => onPlaySelection(selectionInfo.startTime, selectionInfo.endTime)}
          >
            Play selection
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
            onClick={() => void navigator.clipboard.writeText(selectionInfo.text)}
          >
            Copy
          </button>
          <button
            type="button"
            className="ml-auto text-slate-400 hover:text-slate-600"
            onClick={() => clearSelection()}
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4 select-none">
        {transcript.segments.map((segment) => (
          <div key={segment.id}>
            <div className="mb-1 text-xs font-semibold text-slate-500">
              {segment.speaker_id
                ? (speakerNames.get(segment.speaker_id) ?? 'Unknown speaker')
                : 'Unknown speaker'}
            </div>
            <p className="leading-relaxed text-slate-800">
              {segment.tokens.map((token) => (
                <span
                  key={token.id}
                  ref={token.id === activeTokenId ? activeRef : undefined}
                  onMouseDown={() => handleTokenMouseDown(token)}
                  onMouseEnter={() => handleTokenMouseEnter(token)}
                  className={
                    selectedIds.has(token.id)
                      ? 'cursor-pointer rounded bg-sky-200 px-0.5'
                      : token.id === activeTokenId
                        ? 'cursor-pointer rounded bg-amber-200 px-0.5'
                        : 'cursor-pointer rounded px-0.5 hover:bg-slate-100'
                  }
                >
                  {token.text}{' '}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
