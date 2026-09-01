import { NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useDocumentCommentsContext } from './documentCommentsContext'
import type { ClipBlockNodeAttrs } from './clipBlockNode'

/**
 * A non-editable, atomic reference to a transcript excerpt, rendered as
 * styled inline text within the document's normal paragraph flow (not a
 * boxed card) — a persistent left border + background tint marks "this text
 * is from source material"; an underline (added only once a comment exists)
 * is reserved exclusively for comments, so the two channels stack without
 * colliding. Selecting the node (click, or arrow-key onto it) produces a
 * native ProseMirror `NodeSelection` (see `selectable: true`), which is what
 * `DocumentEditor`'s shared `BubbleMenu` keys off to show Play/Comment/Remove
 * — this view itself only renders the excerpt and its decoration classes.
 */
export function ClipBlockView({ node, selected }: ReactNodeViewProps) {
  const attrs = node.attrs as ClipBlockNodeAttrs
  const { clipCommentStatus, highlightedNodeId } = useDocumentCommentsContext()

  const commentStatus = attrs.nodeId ? clipCommentStatus.get(attrs.nodeId) : undefined
  const decorationClass = commentStatus
    ? commentStatus.resolved
      ? 'underline decoration-success decoration-2 underline-offset-2'
      : 'underline decoration-warning decoration-2 underline-offset-2'
    : ''
  const isHighlighted = attrs.nodeId !== undefined && attrs.nodeId === highlightedNodeId

  return (
    <NodeViewWrapper
      as="span"
      data-clip-block=""
      data-node-id={attrs.nodeId}
      className={`border-l-2 border-info bg-info-subtle px-1 py-0.5 ${decorationClass} ${
        selected || isHighlighted ? 'ring-1 ring-brand' : ''
      } ${isHighlighted ? 'bg-brand-subtle' : ''}`}
    >
      {attrs.excerpt ?? 'Clip'}
    </NodeViewWrapper>
  )
}
