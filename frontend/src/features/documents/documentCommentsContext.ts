import { createContext, useContext } from 'react'

export interface ClipCommentStatus {
  resolved: boolean
}

export interface DocumentCommentsContextValue {
  /** Keyed by a clipBlock node's stable `nodeId`; absent means no comment. */
  clipCommentStatus: Map<string, ClipCommentStatus>
}

/**
 * Bridges comment status from `DocumentEditor` (which owns the
 * `useDocumentComments` hook) down to `ClipBlockView` node views, purely for
 * resolved/unresolved underline styling. Node views render via
 * `ReactNodeViewRenderer`'s portals, but React context still propagates
 * through portals into them. Creating a clip comment is triggered from the
 * shared `BubbleMenu` popup in `DocumentEditor` itself (Phase E6), not from
 * here — the node view no longer needs a create action.
 */
export const DocumentCommentsContext = createContext<DocumentCommentsContextValue>({
  clipCommentStatus: new Map(),
})

export function useDocumentCommentsContext(): DocumentCommentsContextValue {
  return useContext(DocumentCommentsContext)
}
