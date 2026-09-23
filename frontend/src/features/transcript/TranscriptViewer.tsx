import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import { useCommentsStore } from '../../store/comments'
import {
  isTokenConflict,
  useDeleteTokens,
  useEditToken,
  useHighlightTokens,
  useMergeTokens,
  useSplitToken,
} from '../../api/hooks/useTokens'
import { transcriptAnchor, useCreateComment } from '../../api/hooks/useComments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { clipBlockMarkerHtml, writeClipToClipboard } from '../documents/clipClipboard'
import { findActiveTokenId } from './activeToken'
import { chunkTokens } from './chunkTokens'
import { SpeakerBar } from './SpeakerBar'
import { formatTime } from '../player/format'
import { SelectionToolbar } from '../toolbar/SelectionToolbar'
import { Select } from '../../components/ui/Select'
import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  X as CloseIcon,
  MessageSquare as CommentIcon,
  Copy as CopyIcon,
  FileText as DocumentIcon,
  Pencil as EditIcon,
  Highlighter as HighlighterIcon,
  Play as PlayIcon,
  Search as SearchIcon,
} from 'lucide-react'
import type { ToolbarAction } from '../toolbar/SelectionToolbar'
import type { Speaker } from '../../api/hooks/useSpeakers'
import { useReassignSegmentSpeaker } from '../../api/hooks/useTranscripts'
import type { Token, Transcript } from '../../api/hooks/useTranscripts'
import type { Comment } from '../../api/hooks/useComments'

// Select's value is always a string, so an unattributed segment (speakerId
// null) needs a sentinel that can't collide with a real speaker uuid.
const SPEAKER_UNATTRIBUTED = '__unattributed__'

interface TranscriptViewerProps {
  transcript: Transcript | undefined
  speakers: Speaker[] | undefined
  comments?: Comment[] | undefined
  isLoading: boolean
  onSeekToken: (seconds: number) => void
  onPlaySelection: (startTime: number, endTime: number) => void
  /** Seeks to and plays from a point with no stop time — a double-clicked
   * token's action, distinct from `onSeekToken` (seek only, no play) and
   * `onPlaySelection` (plays a bounded range then pauses). */
  onPlayFrom: (seconds: number) => void
  /** Whether the caller's project role allows editing (editor/owner) — a
   * viewer can still watch, select, and copy, but not edit/delete/merge/split
   * tokens or comment. */
  canEdit: boolean
  /** The video this transcript belongs to — needed to anchor an inserted
   * clip block to a video, not just a transcript. */
  videoId: string
}

interface SpeakerGroup {
  key: string
  speakerId: string | null
  segmentIds: string[]
  tokens: Token[]
}

/**
 * Renders a transcript's segments/speakers/tokens, highlighting the token
 * matching the current playback time and (when auto-follow is on) scrolling
 * it into view. Consecutive segments spoken by the same speaker are grouped
 * under a single speaker header, matching how the transcript reads out loud.
 * A plain click on a token edits its text inline for an editor (clearing it
 * deletes the token, typing a space splits it into multiple tokens) or seeks
 * the video there for a viewer; double-clicking always seeks and plays from
 * that point instead, for both roles. Dragging across tokens selects a
 * range, showing its text/timecodes and play/copy/edit/comment actions —
 * there is no separate delete action; clearing the Edit draft to empty text
 * deletes the whole selection, the same "clear it to delete it" rule the
 * single-token edit already uses. Ranges covered by a comment are underlined
 * (violet while unresolved, gray once resolved). An inline search finds and
 * steps through matches in this transcript.
 */
export function TranscriptViewer({
  transcript,
  speakers,
  comments,
  isLoading,
  onSeekToken,
  onPlaySelection,
  onPlayFrom,
  canEdit,
  videoId,
}: TranscriptViewerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const autoFollow = usePlaybackStore((s) => s.autoFollow)
  const setAutoFollow = usePlaybackStore((s) => s.setAutoFollow)

  const selectionRange = useSelectionStore((s) => s.range)
  const startSelection = useSelectionStore((s) => s.start)
  const extendSelection = useSelectionStore((s) => s.extend)
  const finishSelection = useSelectionStore((s) => s.finish)
  const clearSelection = useSelectionStore((s) => s.clear)
  const setSelectionRange = useSelectionStore((s) => s.setRange)
  const queueInsert = useDocumentPanelStore((s) => s.queueInsert)
  const selectComment = useCommentsStore((s) => s.select)

  const transcriptId = transcript?.id ?? ''
  const editToken = useEditToken(transcriptId)
  const deleteTokens = useDeleteTokens(transcriptId)
  const mergeTokens = useMergeTokens(transcriptId)
  const splitToken = useSplitToken(transcriptId)
  const highlightTokens = useHighlightTokens(transcriptId)
  const reassignSegmentSpeaker = useReassignSegmentSpeaker(transcriptId)
  const createComment = useCreateComment(transcriptId)

  // A 409 from any token mutation means someone else edited it first; the
  // optimistic attempt is left on screen (see useTokens.ts) and a banner asks
  // the user to reload rather than silently refetching out from under them.
  const client = useQueryClient()
  const tokenMutations = [editToken, deleteTokens, mergeTokens, splitToken, highlightTokens]
  const conflict = tokenMutations.find((m) => isTokenConflict(m.error))
  function reloadAfterConflict() {
    for (const mutation of tokenMutations) mutation.reset()
    void client.invalidateQueries({ queryKey: ['transcript', transcriptId] })
  }

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
        last.segmentIds.push(segment.id)
      } else {
        groups.push({
          key: segment.id,
          speakerId: segment.speaker_id,
          segmentIds: [segment.id],
          tokens: [...segment.tokens],
        })
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
    canEdit &&
    selectedTokens.length >= 2 &&
    selectedTokens.every((t) => t.segment_id === selectedTokens[0].segment_id)

  // Which tokens fall inside a comment's anchored range, and whether the
  // "strongest" (most recently unresolved) covering comment is resolved —
  // drives the underline shown under commented text.
  const commentedTokenInfo = useMemo(() => {
    const map = new Map<string, { resolved: boolean }>()
    for (const comment of comments ?? []) {
      const anchor = transcriptAnchor(comment)
      if (!anchor) continue
      const a = tokenIndex.get(anchor.start_token_id)
      const b = tokenIndex.get(anchor.end_token_id)
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

  // Reverse lookup from a token to whichever comment's range covers it —
  // needed to select/highlight that comment (in `CommentsPanel`) when the
  // token itself is clicked, the same "click a commented span to highlight
  // its comment" behavior `DocumentEditor` has for document comments.
  const commentIdByTokenId = useMemo(() => {
    const map = new Map<string, string>()
    for (const comment of comments ?? []) {
      const anchor = transcriptAnchor(comment)
      if (!anchor) continue
      const a = tokenIndex.get(anchor.start_token_id)
      const b = tokenIndex.get(anchor.end_token_id)
      if (a === undefined || b === undefined) continue
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) map.set(flatTokens[i].id, comment.id)
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const POPUP_EDGE = 8
  const [popupAnchor, setPopupAnchor] = useState<{
    top: number
    anchorX: number
    placement: 'above' | 'below' | 'top'
  } | null>(null)
  // The popup's real rendered width, measured below — starts at a rough
  // guess so the very first paint of a brand new popup has something to
  // clamp against before it has actually mounted.
  const [popupWidth, setPopupWidth] = useState(320)

  useEffect(() => {
    if (!currentMatch) return
    tokenRefs.current.get(currentMatch.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch])

  // Floats the selection toolbar above the selected token range (matching
  // the document editor's BubbleMenu), portaled to `document.body` and
  // positioned with `position: fixed` in viewport coordinates — not as an
  // absolutely positioned child of the scrollable transcript panel, which
  // clipped the popup any time it would render partly outside that panel's
  // own box. Recomputed on every selection change, on scroll, and on
  // resize; when there isn't room on either side of the selection it clamps
  // to the top of the viewport instead of disappearing off-screen.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container || selectedTokens.length === 0) {
      setPopupAnchor(null)
      return
    }

    function recompute() {
      const firstEl = tokenRefs.current.get(selectedTokens[0].id)
      const lastEl = tokenRefs.current.get(selectedTokens[selectedTokens.length - 1].id)
      if (!firstEl || !lastEl) {
        setPopupAnchor(null)
        return
      }
      const firstRect = firstEl.getBoundingClientRect()
      const lastRect = lastEl.getBoundingClientRect()
      const top = Math.min(firstRect.top, lastRect.top)
      const bottom = Math.max(firstRect.bottom, lastRect.bottom)
      const anchorX = (firstRect.left + lastRect.right) / 2

      const GAP = 8
      // Rough estimate — only used to decide above/below placement, not the
      // popup's actual rendered size (that's measured separately below).
      const ESTIMATED_HEIGHT = 48

      if (top - ESTIMATED_HEIGHT - GAP >= POPUP_EDGE) {
        setPopupAnchor({ top: top - GAP, anchorX, placement: 'above' })
      } else if (bottom + ESTIMATED_HEIGHT + GAP <= window.innerHeight - POPUP_EDGE) {
        setPopupAnchor({ top: bottom + GAP, anchorX, placement: 'below' })
      } else {
        // No room above or below (a huge selection filling the viewport) —
        // pin to the top of the viewport rather than hiding.
        setPopupAnchor({ top: POPUP_EDGE, anchorX, placement: 'top' })
      }
    }

    recompute()
    container.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute)
    return () => {
      container.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
    }
  }, [selectedTokens, mergeDraft, commentDraft])

  // Measures the popup's real width once it (re)renders — a long selection
  // summary or the draft mode's input can render wider than the `popupWidth`
  // guess above, which used to push the popup's clamped-by-estimate position
  // partly off the left edge of the viewport. Runs as its own layout effect
  // (after the DOM reflects the current anchor/mode) so the corrected width
  // is applied before the browser paints, not as a visible post-paint jump.
  useLayoutEffect(() => {
    if (!popupAnchor) return
    const width = popupRef.current?.getBoundingClientRect().width
    if (width) setPopupWidth(width)
  }, [popupAnchor, mergeDraft, commentDraft])

  const popupPos = popupAnchor
    ? {
        top: popupAnchor.top,
        left: Math.min(
          Math.max(popupAnchor.anchorX, POPUP_EDGE + popupWidth / 2),
          window.innerWidth - POPUP_EDGE - popupWidth / 2,
        ),
        placement: popupAnchor.placement,
      }
    : null

  function stepMatch(direction: 1 | -1) {
    if (searchMatches.length === 0) return
    setMatchIndex((i) => (i + direction + searchMatches.length) % searchMatches.length)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

  // Tracks the drag gesture: a plain click (no movement onto another token)
  // edits/seeks; movement onto a second token starts a range selection
  // instead.
  const dragAnchorRef = useRef<Token | null>(null)
  const draggingRef = useRef(false)

  // A plain click's edit/seek action is deferred ~250ms so a following
  // double-click (play-from-here) can cancel it first — without this, the
  // double-click's own first click would already have opened an edit box or
  // seeked before the "dblclick" event even fires. Any new mousedown or a
  // dblclick clears whatever's pending, so at most one deferred action is
  // ever in flight.
  const SINGLE_CLICK_DELAY_MS = 250
  const pendingClickTimerRef = useRef<number | null>(null)
  function clearPendingClick() {
    if (pendingClickTimerRef.current !== null) {
      window.clearTimeout(pendingClickTimerRef.current)
      pendingClickTimerRef.current = null
    }
  }

  useEffect(() => {
    function handleMouseUp() {
      if (draggingRef.current) {
        finishSelection()
      } else if (dragAnchorRef.current) {
        const token = dragAnchorRef.current
        clearPendingClick()
        pendingClickTimerRef.current = window.setTimeout(() => {
          pendingClickTimerRef.current = null
          if (canEdit) beginEdit(token)
          else onSeekToken(token.start_time)
          clearSelection()
          selectComment(commentIdByTokenId.get(token.id) ?? null)
        }, SINGLE_CLICK_DELAY_MS)
      }
      dragAnchorRef.current = null
      draggingRef.current = false
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [canEdit, onSeekToken, finishSelection, clearSelection, selectComment, commentIdByTokenId])

  function commitEdit() {
    if (!editingTokenId) return
    const tokenId = editingTokenId
    const token = flatTokens.find((t) => t.id === tokenId)
    const trimmed = editingText.trim()
    setEditingTokenId(null)
    if (!token) return
    if (trimmed === '') {
      deleteTokens.mutate({ tokens: [{ tokenId, expectedVersion: token.version }] })
    } else if (/\s/.test(trimmed)) {
      splitToken.mutate({
        tokenId,
        expectedVersion: token.version,
        texts: trimmed.split(/\s+/).filter(Boolean),
      })
    } else {
      editToken.mutate({ tokenId, text: trimmed, expectedVersion: token.version })
    }
  }

  // Ctrl/Cmd+S commits an in-progress edit and always prevents the browser's
  // "Save page" dialog, since edits are meant to be saved this way. Backspace/
  // Delete deletes the current token selection — the same "clear it to
  // delete it" rule as the Edit draft's empty-confirm, just without having
  // to open the draft first. Both are read through refs so the listener is
  // registered once and isn't re-subscribed on every keystroke/playback tick.
  const commitEditRef = useRef(commitEdit)
  commitEditRef.current = commitEdit

  const backspaceDeleteRef = useRef<() => boolean>(() => false)
  backspaceDeleteRef.current = () => {
    if (!canEdit || editingTokenId !== null || mergeDraft !== null || commentDraft !== null) {
      return false
    }
    if (selectedTokens.length === 0) return false
    deleteSelection()
    return true
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        commitEditRef.current()
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const target = e.target
        // Let normal text editing happen inside any focused input/textarea
        // (search box, comment/edit drafts) or contenteditable — this
        // shortcut is only for a token range selected in the transcript
        // itself.
        if (
          target instanceof HTMLElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return
        }
        if (backspaceDeleteRef.current()) {
          e.preventDefault()
        }
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
    return <div className="p-6 text-center text-body text-text-muted">Loading transcript…</div>
  }

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="p-6 text-center text-body text-text-muted">No transcript available yet.</div>
    )
  }

  function handleTokenMouseDown(token: Token) {
    dragAnchorRef.current = token
    draggingRef.current = false
    // A new mousedown means a fresh click sequence — cancel whatever the
    // previous click's mouseup deferred, so a real double-click never lets
    // the first click's edit/seek slip through before the second click lands.
    clearPendingClick()
    // Gives the scroll container keyboard focus so a subsequent Cmd/Ctrl+A
    // is scoped to this transcript (see the container's onKeyDown below)
    // instead of the browser's page-wide select-all.
    scrollContainerRef.current?.focus()
  }

  // Double-click seeks and plays from this token, for viewers and editors
  // alike — takes over the single click's deferred edit/seek before it can
  // fire (see the mouseup handler above).
  function handleTokenDoubleClick(token: Token) {
    clearPendingClick()
    onPlayFrom(token.start_time)
  }

  // Scopes Cmd/Ctrl+A to this transcript's tokens rather than the whole page
  // — plain spans aren't natively selectable text, so without this the
  // browser falls back to selecting all page content. Only acts once this
  // container has keyboard focus (set on token mousedown above), so it never
  // fires while typing in an unrelated input/textarea elsewhere on the page.
  function handleContainerKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      if (!transcript || flatTokens.length === 0) return
      e.preventDefault()
      setSelectionRange(transcript.id, flatTokens[0].id, flatTokens[flatTokens.length - 1].id)
    }
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

  // Clearing the draft to empty deletes the whole selection, regardless of
  // segment span — mirrors the single-token double-click-to-clear pattern
  // (commitEdit above), so there's one "clear text to delete" rule instead of
  // a separate Delete action. Replacing with non-empty text is still a real
  // merge, which the backend only allows within one segment; a cross-segment
  // selection with non-empty text is left as a no-op (draft stays open) since
  // there's no destination token to write it to.
  function confirmMerge() {
    if (mergeDraft === null) return
    const trimmed = mergeDraft.trim()
    if (trimmed === '') {
      deleteSelection()
      return
    }
    if (!canMerge) return
    mergeTokens.mutate({
      tokens: selectedTokens.map((t) => ({ tokenId: t.id, expectedVersion: t.version })),
      text: trimmed,
    })
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

  // Writes both a plain-text and a marker-HTML clipboard entry so pasting
  // into a document reconstructs an inline clip reference (not just the
  // excerpt string) while pasting elsewhere still yields plain text — see
  // `clipClipboard.ts`. Anchored to whichever transcript (original or
  // translation) is currently on screen, same as `addSelectionToDocument`.
  function copySelection() {
    if (!transcript || selectedTokens.length === 0 || !selectionInfo) return
    void writeClipToClipboard(
      selectionInfo.text,
      clipBlockMarkerHtml(
        {
          nodeId: crypto.randomUUID(),
          transcriptId: transcript.id,
          videoId,
          startTokenId: selectedTokens[0].id,
          endTokenId: selectedTokens[selectedTokens.length - 1].id,
        },
        selectionInfo.text,
      ),
    )
  }

  // Anchors the clip to whichever transcript (original or translation) is
  // currently on screen — not forced to the original, unlike chat citations
  // (see docs/1100_document_builder.md's anchor-resolution rationale).
  function addSelectionToDocument() {
    if (!transcript || selectedTokens.length === 0) return
    queueInsert({
      transcriptId: transcript.id,
      videoId,
      startTokenId: selectedTokens[0].id,
      endTokenId: selectedTokens[selectedTokens.length - 1].id,
    })
    clearSelection()
  }

  function deleteSelection() {
    deleteTokens.mutate({
      tokens: selectedTokens.map((t) => ({ tokenId: t.id, expectedVersion: t.version })),
    })
    setMergeDraft(null)
    clearSelection()
  }

  const allSelectedHighlighted =
    selectedTokens.length > 0 && selectedTokens.every((t) => t.is_highlighted)

  function toggleHighlightSelection() {
    highlightTokens.mutate({
      tokens: selectedTokens.map((t) => ({ tokenId: t.id, expectedVersion: t.version })),
      isHighlighted: !allSelectedHighlighted,
    })
    clearSelection()
  }

  const toolbarActions: ToolbarAction[] = []
  if (selectionInfo) {
    toolbarActions.push(
      {
        id: 'play',
        icon: PlayIcon,
        label: 'Play selection',
        variant: 'primary',
        onClick: () => onPlaySelection(selectionInfo.startTime, selectionInfo.endTime),
      },
      {
        id: 'copy',
        icon: CopyIcon,
        label: 'Copy',
        onClick: copySelection,
      },
    )
    if (canEdit) {
      toolbarActions.push({
        id: 'highlight',
        icon: HighlighterIcon,
        label: allSelectedHighlighted ? 'Remove highlight' : 'Highlight',
        variant: 'highlighted',
        active: allSelectedHighlighted,
        onClick: toggleHighlightSelection,
      })
      toolbarActions.push({
        id: 'edit',
        icon: EditIcon,
        label: 'Edit',
        onClick: () => setMergeDraft(selectionInfo.text),
      })
      toolbarActions.push({
        id: 'comment',
        icon: CommentIcon,
        label: 'Comment',
        variant: 'highlight',
        onClick: () => setCommentDraft(''),
      })
      toolbarActions.push({
        id: 'add-to-document',
        icon: DocumentIcon,
        label: 'Add to Document',
        onClick: addSelectionToDocument,
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-glass-line px-4 py-2">
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-1">
            <SearchIcon className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1)
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder="Find in transcript…"
              className="min-w-0 flex-1 rounded-lg border border-glass-line bg-glass px-2 py-1 text-small text-text backdrop-blur-sm"
            />
            <span className="shrink-0 font-mono text-small text-text-muted">
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
              className="rounded-lg p-1 text-text-muted hover:bg-glass disabled:opacity-40"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              title="Next match"
              disabled={searchMatches.length === 0}
              onClick={() => stepMatch(1)}
              className="rounded-lg p-1 text-text-muted hover:bg-glass disabled:opacity-40"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Close search"
              title="Close search"
              onClick={closeSearch}
              className="rounded-lg p-1 text-text-muted hover:bg-glass"
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
            className="rounded-lg p-1 text-text-muted hover:bg-glass"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-small text-text-muted">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => setAutoFollow(e.target.checked)}
            className="accent-brand"
          />
          Auto-follow
        </label>
      </div>

      <SpeakerBar videoId={videoId} speakers={speakers ?? []} canEdit={canEdit} />

      {conflict && (
        <div className="flex items-center gap-3 border-b border-danger-subtle bg-danger-subtle px-4 py-2 text-small text-danger-text">
          <span>This was edited by someone else. Your change was not saved.</span>
          <button
            type="button"
            onClick={reloadAfterConflict}
            className="ml-auto rounded-lg bg-danger px-2 py-1 font-medium text-text-inverted hover:opacity-90"
          >
            Reload
          </button>
        </div>
      )}

      {selectionInfo &&
        popupPos &&
        createPortal(
          // Solid, not glass: this floats over arbitrary transcript text, so
          // legibility wins over the frosted look used for the surrounding
          // chrome — same call as the other floating overlay shells
          // (Popover/DropdownMenu/Select/Dialog content).
          <div
            ref={popupRef}
            className="fixed z-50 w-max max-w-[90vw] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
            style={{
              top: popupPos.top,
              left: popupPos.left,
              transform:
                popupPos.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            {mergeDraft !== null ? (
              <SelectionToolbar
                mode="draft"
                draft={{
                  label: 'Edit to:',
                  value: mergeDraft,
                  onChange: setMergeDraft,
                  onConfirm: confirmMerge,
                  onCancel: () => setMergeDraft(null),
                }}
              />
            ) : commentDraft !== null ? (
              <SelectionToolbar
                mode="draft"
                draft={{
                  label: 'Comment:',
                  value: commentDraft,
                  onChange: setCommentDraft,
                  onConfirm: confirmComment,
                  onCancel: () => setCommentDraft(null),
                  accentClass: 'border-warning-subtle bg-warning-subtle',
                  inputAccentClass: 'border-warning',
                }}
              />
            ) : (
              <SelectionToolbar
                mode="actions"
                summary={{
                  text: selectionInfo.text,
                  timecode: `${formatTime(selectionInfo.startTime)} – ${formatTime(selectionInfo.endTime)}`,
                }}
                actions={toolbarActions}
                onClear={() => clearSelection()}
              />
            )}
          </div>,
          document.body,
        )}

      <div
        ref={scrollContainerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        className="flex-1 space-y-4 overflow-y-auto p-4 select-none focus:outline-none"
      >
        {speakerGroups.map((group) => (
          <div key={group.key}>
            <div className="mb-1 text-small font-semibold text-text-muted">
              {canEdit && speakers && speakers.length > 0 ? (
                <Select
                  aria-label="Speaker"
                  value={group.speakerId ?? SPEAKER_UNATTRIBUTED}
                  onValueChange={(value) =>
                    reassignSegmentSpeaker.mutate({
                      segmentIds: group.segmentIds,
                      speakerId: value === SPEAKER_UNATTRIBUTED ? null : value,
                    })
                  }
                  options={[
                    { value: SPEAKER_UNATTRIBUTED, label: 'Unknown speaker' },
                    ...speakers.map((s) => ({ value: s.id, label: s.name ?? 'Unnamed speaker' })),
                  ]}
                  className="h-auto min-w-0 border-none bg-transparent p-0 text-small font-semibold text-text-muted hover:text-text"
                />
              ) : group.speakerId ? (
                (speakerNames.get(group.speakerId) ?? 'Unknown speaker')
              ) : (
                'Unknown speaker'
              )}
            </div>
            {chunkTokens(group.tokens).map((chunk) => (
              <div key={chunk[0].id} className="mb-2 last:mb-0">
                <div className="mb-0.5 font-mono text-small text-text-muted">
                  {formatTime(chunk[0].start_time)}
                </div>
                <p className="leading-relaxed text-text">
                  {chunk.map((token) => {
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
                          className="rounded-sm border border-brand bg-surface px-0.5 text-text"
                        />
                      )
                    }
                    const isCurrentMatch = currentMatch?.id === token.id
                    const isMatch = matchIds.has(token.id)
                    // Selection (brand) > current search match (warning, vivid) >
                    // active/playing token (info) > user-applied highlight
                    // (highlight-subtle) > other matches (warning-subtle) > plain
                    // hover — each state means something different, per the
                    // workspace's "color reserved for meaning" rule.
                    const bg = selectedIds.has(token.id)
                      ? 'bg-brand-subtle'
                      : isCurrentMatch
                        ? 'bg-warning'
                        : token.id === activeTokenId
                          ? 'bg-info-subtle'
                          : token.is_highlighted
                            ? 'bg-highlight-subtle'
                            : isMatch
                              ? 'bg-warning-subtle'
                              : 'hover:bg-glass'
                    const comment = commentedTokenInfo.get(token.id)
                    const decoration = comment
                      ? comment.resolved
                        ? 'underline decoration-success decoration-2 underline-offset-2'
                        : 'underline decoration-warning decoration-2 underline-offset-2'
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
                        onDoubleClick={() => handleTokenDoubleClick(token)}
                        className={`${canEdit ? 'cursor-text' : 'cursor-default'} rounded px-0.5 ${bg} ${decoration}`}
                      >
                        {token.text}{' '}
                      </span>
                    )
                  })}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
