import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import {
  useDeleteTokens,
  useEditToken,
  useMergeTokens,
  useSplitToken,
} from '../../api/hooks/useTokens'
import { useCreateComment } from '../../api/hooks/useComments'
import { findActiveTokenId } from './activeToken'
import { formatTime } from '../player/format'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CommentIcon,
  CopyIcon,
  EditIcon,
  PlayIcon,
  SearchIcon,
  TrashIcon,
} from '../../components/icons'
import type { Speaker } from '../../api/hooks/useSpeakers'
import type { Token, Transcript } from '../../api/hooks/useTranscripts'
import type { Comment } from '../../api/hooks/useComments'

interface TranscriptViewerProps {
  transcript: Transcript | undefined
  speakers: Speaker[] | undefined
  comments?: Comment[] | undefined
  isLoading: boolean
  onSeekToken: (seconds: number) => void
  onPlaySelection: (startTime: number, endTime: number) => void
}

interface SpeakerGroup {
  key: string
  speakerId: string | null
  tokens: Token[]
}

/**
 * Renders a transcript's segments/speakers/tokens, highlighting the token
 * matching the current playback time and (when auto-follow is on) scrolling
 * it into view. Consecutive segments spoken by the same speaker are grouped
 * under a single speaker header, matching how the transcript reads out loud.
 * Clicking a token seeks the video there; dragging across tokens selects a
 * range, showing its text/timecodes and play/copy/edit/comment/delete
 * actions. Double-clicking a token edits its text inline — clearing it
 * deletes the token, typing a space splits it into multiple tokens. Ranges
 * covered by a comment are underlined (violet while unresolved, gray once
 * resolved). An inline search finds and steps through matches in this
 * transcript.
 */
export function TranscriptViewer({
  transcript,
  speakers,
  comments,
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
  const createComment = useCreateComment(transcriptId)

  const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [mergeDraft, setMergeDraft] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState<string | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)

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

  // Consecutive segments spoken by the same speaker are shown as one block
  // with a single speaker header, rather than repeating it per segment.
  const speakerGroups = useMemo<SpeakerGroup[]>(() => {
    if (!transcript) return []
    const groups: SpeakerGroup[] = []
    for (const segment of transcript.segments) {
      const last = groups[groups.length - 1]
      if (last && last.speakerId === segment.speaker_id) {
        last.tokens.push(...segment.tokens)
      } else {
        groups.push({ key: segment.id, speakerId: segment.speaker_id, tokens: [...segment.tokens] })
      }
    }
    return groups
  }, [transcript])

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

  // Which tokens fall inside a comment's anchored range, and whether the
  // "strongest" (most recently unresolved) covering comment is resolved —
  // drives the underline shown under commented text.
  const commentedTokenInfo = useMemo(() => {
    const map = new Map<string, { resolved: boolean }>()
    for (const comment of comments ?? []) {
      const a = tokenIndex.get(comment.start_token_id)
      const b = tokenIndex.get(comment.end_token_id)
      if (a === undefined || b === undefined) continue
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) {
        const token = flatTokens[i]
        const existing = map.get(token.id)
        if (!existing || (existing.resolved && !comment.resolved)) {
          map.set(token.id, { resolved: comment.resolved })
        }
      }
    }
    return map
  }, [comments, tokenIndex, flatTokens])

  // Tokens matching the in-transcript search query, in transcript order.
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return flatTokens.filter((t) => t.text.toLowerCase().includes(query))
  }, [flatTokens, searchQuery])
  const matchIds = useMemo(() => new Set(searchMatches.map((t) => t.id)), [searchMatches])
  const currentMatch =
    searchMatches.length > 0 ? searchMatches[matchIndex % searchMatches.length] : null

  useEffect(() => setMatchIndex(0), [searchQuery])

  const tokenRefs = useRef(new Map<string, HTMLSpanElement>())

  useEffect(() => {
    if (!currentMatch) return
    tokenRefs.current.get(currentMatch.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch])

  function stepMatch(direction: 1 | -1) {
    if (searchMatches.length === 0) return
    setMatchIndex((i) => (i + direction + searchMatches.length) % searchMatches.length)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

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

  const activeRef = useRef<HTMLSpanElement | null>(null)

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
    setCommentDraft(null)
    setEditingTokenId(token.id)
    setEditingText(token.text)
  }

  function confirmMerge() {
    if (mergeDraft === null || mergeDraft.trim() === '') return
    mergeTokens.mutate({ tokenIds: selectedTokens.map((t) => t.id), text: mergeDraft.trim() })
    setMergeDraft(null)
    clearSelection()
  }

  function confirmComment() {
    if (commentDraft === null || commentDraft.trim() === '' || selectedTokens.length === 0) return
    createComment.mutate({
      startTokenId: selectedTokens[0].id,
      endTokenId: selectedTokens[selectedTokens.length - 1].id,
      text: commentDraft.trim(),
    })
    setCommentDraft(null)
    clearSelection()
  }

  function deleteSelection() {
    deleteTokens.mutate({ tokenIds: selectedTokens.map((t) => t.id) })
    clearSelection()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-1">
            <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1)
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder="Find in transcript…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <span className="shrink-0 font-mono text-xs text-slate-400">
              {searchQuery
                ? `${searchMatches.length > 0 ? matchIndex + 1 : 0}/${searchMatches.length}`
                : ''}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              title="Previous match"
              disabled={searchMatches.length === 0}
              onClick={() => stepMatch(-1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              title="Next match"
              disabled={searchMatches.length === 0}
              onClick={() => stepMatch(1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Close search"
              title="Close search"
              onClick={closeSearch}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Search transcript"
            title="Search transcript"
            onClick={() => setSearchOpen(true)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
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
            <span className="text-slate-500">Edit to:</span>
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
        ) : commentDraft !== null ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-violet-100 bg-violet-50 px-4 py-2 text-xs text-slate-600">
            <span className="text-slate-500">Comment:</span>
            <input
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmComment()
                if (e.key === 'Escape') setCommentDraft(null)
              }}
              className="min-w-48 flex-1 rounded border border-violet-400 px-1 py-0.5"
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
              onClick={confirmComment}
            >
              Confirm
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
              onClick={() => setCommentDraft(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-slate-600">
            <span className="font-mono">
              {formatTime(selectionInfo.startTime)} – {formatTime(selectionInfo.endTime)}
            </span>
            <span className="max-w-xs truncate italic">"{selectionInfo.text}"</span>
            <button
              type="button"
              aria-label="Play selection"
              title="Play selection"
              className="rounded bg-slate-800 p-1.5 text-white hover:bg-slate-700"
              onClick={() => onPlaySelection(selectionInfo.startTime, selectionInfo.endTime)}
            >
              <PlayIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Copy"
              title="Copy"
              className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100"
              onClick={() => void navigator.clipboard.writeText(selectionInfo.text)}
            >
              <CopyIcon className="h-4 w-4" />
            </button>
            {canMerge && (
              <button
                type="button"
                aria-label="Edit"
                title="Edit"
                className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100"
                onClick={() => setMergeDraft(selectionInfo.text)}
              >
                <EditIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-label="Comment"
              title="Comment"
              className="rounded border border-violet-300 p-1.5 text-violet-700 hover:bg-violet-50"
              onClick={() => setCommentDraft('')}
            >
              <CommentIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              title="Delete"
              className="rounded border border-red-300 p-1.5 text-red-600 hover:bg-red-50"
              onClick={deleteSelection}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={() => clearSelection()}
              aria-label="Clear selection"
              title="Clear selection"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

      <div className="flex-1 space-y-4 overflow-y-auto p-4 select-none">
        {speakerGroups.map((group) => (
          <div key={group.key}>
            <div className="mb-1 text-xs font-semibold text-slate-500">
              {group.speakerId
                ? (speakerNames.get(group.speakerId) ?? 'Unknown speaker')
                : 'Unknown speaker'}
            </div>
            <p className="leading-relaxed text-slate-800">
              {group.tokens.map((token) => {
                if (token.id === editingTokenId) {
                  return (
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
                  )
                }
                const isCurrentMatch = currentMatch?.id === token.id
                const isMatch = matchIds.has(token.id)
                const bg = selectedIds.has(token.id)
                  ? 'bg-sky-200'
                  : isCurrentMatch
                    ? 'bg-orange-300'
                    : token.id === activeTokenId
                      ? 'bg-amber-200'
                      : isMatch
                        ? 'bg-yellow-100'
                        : 'hover:bg-slate-100'
                const comment = commentedTokenInfo.get(token.id)
                const decoration = comment
                  ? comment.resolved
                    ? 'underline decoration-slate-300 decoration-2 underline-offset-2'
                    : 'underline decoration-violet-400 decoration-2 underline-offset-2'
                  : ''
                return (
                  <span
                    key={token.id}
                    ref={(el) => {
                      if (el) tokenRefs.current.set(token.id, el)
                      else tokenRefs.current.delete(token.id)
                      if (token.id === activeTokenId) activeRef.current = el
                    }}
                    onMouseDown={() => handleTokenMouseDown(token)}
                    onMouseEnter={() => handleTokenMouseEnter(token)}
                    onDoubleClick={() => beginEdit(token)}
                    className={`cursor-text rounded px-0.5 ${bg} ${decoration}`}
                  >
                    {token.text}{' '}
                  </span>
                )
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
