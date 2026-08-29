import { createContext, useContext } from 'react'

export interface ClipCommentStatus {
  resolved: boolean
}

export interface DocumentCommentsContextValue {
  /** Keyed by a clipBlock node's stable `nodeId`; absent means no comment. */
  clipCommentStatus: Map<string, ClipCommentStatus>
  createClipComment: (nodeId: string, text: string) => void
}

/**
 * Bridges comment state/actions from `DocumentEditor` (which owns the
 * `useDocumentComments`/`useCreateDocumentComment` hooks) down to `ClipBlockView`
 * node views. Node views render via `ReactNodeViewRenderer`'s portals, but
 * React context still propagates through portals into them.
 */
export const DocumentCommentsContext = createContext<DocumentCommentsContextValue>({
  clipCommentStatus: new Map(),
  createClipComment: () => {},
})

export function useDocumentCommentsContext(): DocumentCommentsContextValue {
  return useContext(DocumentCommentsContext)
}
