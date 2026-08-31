import { useState } from 'react'
import { useAuth } from '../../auth/context'
import {
  documentAnchor,
  useReplyToDocumentComment,
  useResolveDocumentComment,
} from '../../api/hooks/useComments'
import { useCommentsStore } from '../../store/comments'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { Comment } from '../../api/hooks/useComments'

interface DocumentCommentsPanelProps {
  documentId: string | null
  comments: Comment[] | undefined
  isLoading: boolean
}

function authorLabel(userId: string, currentUserId: string | undefined) {
  return userId === currentUserId ? 'You' : userId.slice(0, 8)
}

/**
 * Comment threads for the document open on the fullscreen page (`DocumentPage`),
 * mirroring `CommentsPanel`'s layout/behavior for the transcript view — same
 * resolve/reply/selected-state styling — but anchored to `documentAnchor()`
 * instead of `transcriptAnchor()`. Document comments carry no timecode, only
 * an optional resolved excerpt, so "locate" means select the comment (which
 * `DocumentEditor` reacts to by scrolling to and highlighting its mark/clip)
 * rather than seeking a player.
 */
export function DocumentCommentsPanel({
  documentId,
  comments,
  isLoading,
}: DocumentCommentsPanelProps) {
  const { session } = useAuth()
  const currentUserId = session?.user.id

  const openIds = useCommentsStore((s) => s.openIds)
  const toggleOpen = useCommentsStore((s) => s.toggleOpen)
  const selectedId = useCommentsStore((s) => s.selectedId)
  const select = useCommentsStore((s) => s.select)
  const hover = useCommentsStore((s) => s.hover)

  const resolveComment = useResolveDocumentComment(documentId ?? '')
  const replyToComment = useReplyToDocumentComment(documentId ?? '')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  function submitReply(commentId: string) {
    const text = (replyDrafts[commentId] ?? '').trim()
    if (!text) return
    replyToComment.mutate({ commentId, text })
    setReplyDrafts((d) => ({ ...d, [commentId]: '' }))
  }

  return (
    <div className="space-y-2">
      <h3 className="text-small font-semibold tracking-wide text-text-muted uppercase">Comments</h3>

      {isLoading && <div className="text-body text-text-muted">Loading comments…</div>}

      {!isLoading && (!comments || comments.length === 0) && (
        <div className="text-body text-text-muted">
          No comments yet. Select text or a clip in the document to add one.
        </div>
      )}

      {comments?.map((comment) => {
        const isOpen = openIds.has(comment.id)
        const anchor = documentAnchor(comment)
        return (
          <div
            key={comment.id}
            onMouseEnter={() => hover(comment.id)}
            onMouseLeave={() => hover(null)}
            className={`rounded-md border px-3 py-2 text-body ${
              comment.id === selectedId
                ? 'border-brand bg-brand-subtle'
                : 'border-border bg-surface'
            } ${comment.resolved ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="truncate text-small text-text-muted hover:underline"
                onClick={() => select(comment.id)}
              >
                {anchor?.excerpt ? `"${anchor.excerpt}"` : 'Jump to comment'}
              </button>
              <button
                type="button"
                className={`shrink-0 rounded-md border px-2 py-0.5 text-small ${
                  comment.resolved
                    ? 'border-border text-text-muted hover:bg-surface-raised'
                    : 'border-success text-success-text hover:bg-success-subtle'
                }`}
                onClick={() =>
                  resolveComment.mutate({ commentId: comment.id, resolved: !comment.resolved })
                }
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
            </div>

            <p className="mt-1 text-text">{comment.text}</p>
            <div className="mt-1 text-small text-text-muted">
              {authorLabel(comment.created_by, currentUserId)}
            </div>

            {comment.replies.length > 0 && (
              <button
                type="button"
                className="mt-1 text-small text-brand-text hover:underline"
                onClick={() => toggleOpen(comment.id)}
              >
                {isOpen ? 'Hide' : 'Show'} {comment.replies.length}{' '}
                {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {isOpen &&
              comment.replies.map((reply) => (
                <div key={reply.id} className="mt-1 ml-3 border-l border-border pl-2 text-small">
                  <span className="text-text-muted">
                    {authorLabel(reply.created_by, currentUserId)}:
                  </span>{' '}
                  <span className="text-text">{reply.text}</span>
                </div>
              ))}

            <div className="mt-2 flex gap-1">
              <Input
                value={replyDrafts[comment.id] ?? ''}
                onChange={(e) => setReplyDrafts((d) => ({ ...d, [comment.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitReply(comment.id)
                }}
                placeholder="Reply…"
                className="flex-1 text-small"
              />
              <Button size="sm" onClick={() => submitReply(comment.id)}>
                Reply
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
