import { useState } from 'react'
import { useAuth } from '../../auth/context'
import { useReplyToComment, useResolveComment } from '../../api/hooks/useComments'
import { useSelectionStore } from '../../store/selection'
import { useCommentsStore } from '../../store/comments'
import { formatTime } from '../player/format'
import type { Comment } from '../../api/hooks/useComments'

interface CommentsPanelProps {
  transcriptId: string | null
  comments: Comment[] | undefined
  isLoading: boolean
  onLocate: (startTime: number) => void
}

function authorLabel(userId: string, currentUserId: string | undefined) {
  return userId === currentUserId ? 'You' : userId.slice(0, 8)
}

/**
 * Lists comment threads for the active transcript: author, text, timestamp,
 * resolve state, and replies. Clicking a thread's timecode seeks the player
 * and highlights its anchored range in the transcript viewer.
 */
export function CommentsPanel({ transcriptId, comments, isLoading, onLocate }: CommentsPanelProps) {
  const { session } = useAuth()
  const currentUserId = session?.user.id

  const openIds = useCommentsStore((s) => s.openIds)
  const toggleOpen = useCommentsStore((s) => s.toggleOpen)
  const selectedId = useCommentsStore((s) => s.selectedId)
  const select = useCommentsStore((s) => s.select)
  const setSelectionRange = useSelectionStore((s) => s.setRange)

  const resolveComment = useResolveComment(transcriptId ?? '')
  const replyToComment = useReplyToComment(transcriptId ?? '')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  function locate(comment: Comment) {
    select(comment.id)
    if (transcriptId) setSelectionRange(transcriptId, comment.start_token_id, comment.end_token_id)
    onLocate(comment.in_time)
  }

  function submitReply(commentId: string) {
    const text = (replyDrafts[commentId] ?? '').trim()
    if (!text) return
    replyToComment.mutate({ commentId, text })
    setReplyDrafts((d) => ({ ...d, [commentId]: '' }))
  }

  const sortedComments = comments && [...comments].sort((a, b) => a.in_time - b.in_time)

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Comments</h3>

      {isLoading && <div className="text-sm text-slate-400">Loading comments…</div>}

      {!isLoading && (!comments || comments.length === 0) && (
        <div className="text-sm text-slate-400">
          No comments yet. Select a transcript range to add one.
        </div>
      )}

      {sortedComments?.map((comment) => {
        const isOpen = openIds.has(comment.id)
        return (
          <div
            key={comment.id}
            className={`rounded border px-3 py-2 text-sm ${
              comment.id === selectedId ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
            } ${comment.resolved ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="font-mono text-xs text-slate-500 hover:underline"
                onClick={() => locate(comment)}
              >
                {formatTime(comment.in_time)} – {formatTime(comment.out_time)}
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-xs ${
                  comment.resolved
                    ? 'border-slate-300 text-slate-500 hover:bg-slate-100'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
                onClick={() =>
                  resolveComment.mutate({ commentId: comment.id, resolved: !comment.resolved })
                }
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
            </div>

            <p className="mt-1 text-slate-800">{comment.text}</p>
            <div className="mt-1 text-xs text-slate-400">
              {authorLabel(comment.created_by, currentUserId)}
            </div>

            {comment.replies.length > 0 && (
              <button
                type="button"
                className="mt-1 text-xs text-sky-600 hover:underline"
                onClick={() => toggleOpen(comment.id)}
              >
                {isOpen ? 'Hide' : 'Show'} {comment.replies.length}{' '}
                {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {isOpen &&
              comment.replies.map((reply) => (
                <div key={reply.id} className="mt-1 ml-3 border-l border-slate-200 pl-2 text-xs">
                  <span className="text-slate-400">
                    {authorLabel(reply.created_by, currentUserId)}:
                  </span>{' '}
                  <span className="text-slate-700">{reply.text}</span>
                </div>
              ))}

            <div className="mt-2 flex gap-1">
              <input
                value={replyDrafts[comment.id] ?? ''}
                onChange={(e) => setReplyDrafts((d) => ({ ...d, [comment.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitReply(comment.id)
                }}
                placeholder="Reply…"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700"
                onClick={() => submitReply(comment.id)}
              >
                Reply
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
