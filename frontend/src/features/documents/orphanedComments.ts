import { documentAnchor } from '../../api/hooks/useComments'
import type { Comment } from '../../api/hooks/useComments'

interface ProseMirrorNodeLike {
  type?: string
  attrs?: Record<string, unknown>
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
  content?: ProseMirrorNodeLike[]
}

function collectAnchors(node: unknown, markedCommentIds: Set<string>, clipNodeIds: Set<string>) {
  if (!node || typeof node !== 'object') return
  const n = node as ProseMirrorNodeLike
  if (n.type === 'clipBlock' && typeof n.attrs?.nodeId === 'string') {
    clipNodeIds.add(n.attrs.nodeId)
  }
  for (const mark of n.marks ?? []) {
    if (mark.type === 'comment' && typeof mark.attrs?.commentId === 'string') {
      markedCommentIds.add(mark.attrs.commentId)
    }
  }
  for (const child of n.content ?? []) {
    collectAnchors(child, markedCommentIds, clipNodeIds)
  }
}

/**
 * Which of a document's comments no longer have anything to anchor to in
 * `content` — a text-mark comment whose marked span was deleted, or a clip
 * comment whose `clipBlock` node was removed. Reconciles against the
 * content actually just saved rather than diffing against a previous
 * snapshot, so there's no before-state to keep in sync.
 *
 * `excludeIds` keeps a comment whose mark save/retry is still in flight
 * (see `DocumentEditor`'s `pendingMarkSaveRef`/`markRetryRef`) from being
 * treated as orphaned mid-race — its mark exists but hasn't landed in a
 * saved `content` snapshot yet.
 */
export function findOrphanedCommentIds(
  content: unknown,
  comments: Comment[],
  excludeIds: ReadonlySet<string> = new Set(),
): string[] {
  const markedCommentIds = new Set<string>()
  const clipNodeIds = new Set<string>()
  collectAnchors(content, markedCommentIds, clipNodeIds)

  const orphaned: string[] = []
  for (const comment of comments) {
    if (excludeIds.has(comment.id)) continue
    const anchor = documentAnchor(comment)
    if (!anchor) continue
    const present = anchor.clip_node_id
      ? clipNodeIds.has(anchor.clip_node_id)
      : markedCommentIds.has(comment.id)
    if (!present) orphaned.push(comment.id)
  }
  return orphaned
}
