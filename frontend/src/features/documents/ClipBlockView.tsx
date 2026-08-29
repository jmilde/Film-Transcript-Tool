import { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { CommentIcon, PlayIcon, TrashIcon } from '../../components/icons'
import { usePlaybackStore } from '../../store/playback'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { useDocumentCommentsContext } from './documentCommentsContext'
import type { ClipBlockAttrs } from './clipBlockNode'

/** Read-only display fields the backend injects into `attrs` on every read
 * (see `resolve_document_content`); absent until the node has been resolved
 * at least once (e.g. immediately after insert, before the first refetch). */
interface ResolvedClipFields {
  video_name?: string
  start_time?: number
  end_time?: number
  speaker_name?: string | null
  excerpt?: string
  thumbnail_token?: string | null
  folder_path?: string[]
}

type ClipBlockNodeAttrs = ClipBlockAttrs & ResolvedClipFields

/**
 * A non-editable, atomic reference to a transcript excerpt, rendered as
 * styled inline text within the document's normal paragraph flow (not a
 * boxed card) — a persistent left border + background tint marks "this text
 * is from source material"; an underline (added only once a comment exists)
 * is reserved exclusively for comments, so the two channels stack without
 * colliding. Selecting the node (click, or arrow-key onto it) reveals a
 * minimal Play/Comment/Remove action row — this is an interim trigger until
 * Phase E6 replaces it with the shared `BubbleMenu` popup.
 */
export function ClipBlockView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as ClipBlockNodeAttrs
  const activeVideoId = usePlaybackStore((s) => s.activeVideoId)
  const playSelection = usePlaybackStore((s) => s.playSelection)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)
  const { clipCommentStatus, createClipComment } = useDocumentCommentsContext()
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftText, setDraftText] = useState('')

  const commentStatus = attrs.nodeId ? clipCommentStatus.get(attrs.nodeId) : undefined
  const decorationClass = commentStatus
    ? commentStatus.resolved
      ? 'underline decoration-slate-300 decoration-2 underline-offset-2'
      : 'underline decoration-violet-400 decoration-2 underline-offset-2'
    : ''

  // Reuses VideoWorkspace's own player when it's already open on this clip's
  // video (so there's never two players for the same video); otherwise asks
  // the panel to preview the clip in its own player (see ClipPreviewPlayer).
  function handlePlay() {
    if (attrs.start_time === undefined || attrs.end_time === undefined) return
    if (attrs.videoId === activeVideoId && playSelection) {
      playSelection(attrs.start_time, attrs.end_time)
    } else {
      setPreviewClip({
        videoId: attrs.videoId,
        startTime: attrs.start_time,
        endTime: attrs.end_time,
      })
    }
  }

  function submitComment() {
    const text = draftText.trim()
    if (!text || !attrs.nodeId) return
    createClipComment(attrs.nodeId, text)
    setDraftText('')
    setDraftOpen(false)
  }

  return (
    <NodeViewWrapper
      as="span"
      data-clip-block=""
      className={`border-l-2 border-teal-300 bg-teal-50 px-1 py-0.5 ${decorationClass} ${
        selected ? 'ring-1 ring-sky-400' : ''
      }`}
    >
      {attrs.excerpt ?? 'Clip'}
      {selected && (
        <span
          contentEditable={false}
          className="ml-1 inline-flex items-center gap-1 align-middle whitespace-nowrap"
        >
          <button
            type="button"
            aria-label="Play clip"
            title="Play clip"
            className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-600"
            onClick={handlePlay}
          >
            <PlayIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Comment on clip"
            title="Comment on clip"
            className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-600"
            onClick={() => setDraftOpen((open) => !open)}
          >
            <CommentIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remove clip"
            title="Remove clip"
            className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-red-600"
            onClick={() => deleteNode()}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
          {draftOpen && (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitComment()
                  if (e.key === 'Escape') setDraftOpen(false)
                }}
                placeholder="Add a comment…"
                className="rounded border border-slate-300 px-1 py-0.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={submitComment}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white hover:bg-slate-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setDraftOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white"
              >
                Cancel
              </button>
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}
