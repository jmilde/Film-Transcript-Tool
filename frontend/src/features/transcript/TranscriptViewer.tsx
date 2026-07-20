import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import {
  useDeleteTokens,
  useEditToken,
  useMergeTokens,
  useSplitToken,
} from '../../api/hooks/useTokens'
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
 * tokens selects a range, showing its text/timecodes and play/copy/merge/
 * delete actions. Double-clicking a token edits its text inline — clearing it
 * deletes the token, typing a space splits it into multiple tokens.
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

  const transcriptId = transcript?.id ?? ''
  const editToken = useEditToken(transcriptId)
  const deleteTokens = useDeleteTokens(transcriptId)
  const mergeTokens = useMergeTokens(transcriptId)
  const splitToken = useSplitToken(transcriptId)

  const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [mergeDraft, setMergeDraft] = useState<string | null>(null)

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

  const selectedTokens = useMemo(
    () => flatTokens.filter((t) => selectedIds.has(t.id)),
    [selectedIds, flatTokens],
  )

  const selectionInfo = useMemo(() => {
    if (selectedTokens.length < 2) return null
    return {
      text: selectedTokens.map((t) => t.text).join(' '),
      startTime: selectedTokens[0].start_time,
      endTime: selectedTokens[selectedTokens.length - 1].end_time,
    }
  }, [selectedTokens])

  const canMerge =
    selectedTokens.length >= 2 &&
    selectedTokens.every((t) => t.segment_id === selectedTokens[0].segment_id)

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

  function commitEdit() {
    if (!editingTokenId) return
    const tokenId = editingTokenId
    const trimmed = editingText.trim()
    setEditingTokenId(null)
    if (trimmed === '') {
      deleteTokens.mutate({ tokenIds: [tokenId] })
    } else if (/\s/.test(trimmed)) {
      splitToken.mutate({ tokenId, texts: trimmed.split(/\s+/).filter(Boolean) })
    } else {
      editToken.mutate({ tokenId, text: trimmed })
    }
  }

  // Ctrl/Cmd+S commits an in-progress edit and always prevents the browser's
  // "Save page" dialog, since edits are meant to be saved this way. The
  // listener is registered once and reads commitEdit through a ref so it
  // isn't re-subscribed on every keystroke/playback tick.
  const commitEditRef = useRef(commitEdit)
  commitEditRef.current = commitEdit

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        commitEditRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  function beginEdit(token: Token) {
    setMergeDraft(null)
    setEditingTokenId(token.id)
    setEditingText(token.text)
  }

  function confirmMerge() {
    if (mergeDraft === null || mergeDraft.trim() === '') return
    mergeTokens.mutate({ tokenIds: selectedTokens.map((t) => t.id), text: mergeDraft.trim() })
    setMergeDraft(null)
    clearSelection()
  }

  function deleteSelection() {
    deleteTokens.mutate({ tokenIds: selectedTokens.map((t) => t.id) })
    clearSelection()
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

      {selectionInfo &&
        (mergeDraft !== null ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-slate-600">
            <span className="text-slate-500">Merge into:</span>
            <input
              autoFocus
              value={mergeDraft}
              onChange={(e) => setMergeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmMerge()
                if (e.key === 'Escape') setMergeDraft(null)
              }}
              className="rounded border border-sky-400 px-1 py-0.5"
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
              onClick={confirmMerge}
            >
              Confirm
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
              onClick={() => setMergeDraft(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
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
            {canMerge && (
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                onClick={() => setMergeDraft(selectionInfo.text)}
              >
                Merge
              </button>
            )}
            <button
              type="button"
              className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
              onClick={deleteSelection}
            >
              Delete
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
        ))}

      <div className="flex-1 space-y-4 overflow-y-auto p-4 select-none">
        {transcript.segments.map((segment) => (
          <div key={segment.id}>
            <div className="mb-1 text-xs font-semibold text-slate-500">
              {segment.speaker_id
                ? (speakerNames.get(segment.speaker_id) ?? 'Unknown speaker')
                : 'Unknown speaker'}
            </div>
            <p className="leading-relaxed text-slate-800">
              {segment.tokens.map((token) =>
                token.id === editingTokenId ? (
                  <input
                    key={token.id}
                    autoFocus
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditingTokenId(null)
                    }}
                    style={{ width: `${Math.max(editingText.length, 3)}ch` }}
                    className="rounded border border-sky-400 px-0.5 text-slate-800"
                  />
                ) : (
                  <span
                    key={token.id}
                    ref={token.id === activeTokenId ? activeRef : undefined}
                    onMouseDown={() => handleTokenMouseDown(token)}
                    onMouseEnter={() => handleTokenMouseEnter(token)}
                    onDoubleClick={() => beginEdit(token)}
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
                ),
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
