import { useParams } from 'react-router'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useDocument } from '../api/hooks/useDocuments'
import { useDocumentComments } from '../api/hooks/useComments'
import { DocumentEditor } from '../features/documents/DocumentEditor'
import { DocumentCommentsPanel } from '../features/documents/DocumentCommentsPanel'

export function DocumentPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  if (!projectId || !documentId) return null
  return <DocumentPageInner key={documentId} projectId={projectId} documentId={documentId} />
}

/**
 * A document's fullscreen, focused view — the document itself gets real
 * width instead of the docked panel's narrow column, with its comments laid
 * out in a side panel the same way `VideoWorkspace` does for a transcript's
 * comments. Reachable via the "expand" entry point on a tab in the docked
 * `DocumentPanel`; that panel keeps working independently of this page (both
 * can be open on the same document at once, since they just share the same
 * `DocumentEditor`/comments state through TanStack Query + `useCommentsStore`).
 */
function DocumentPageInner({ projectId, documentId }: { projectId: string; documentId: string }) {
  const { data: doc, isError } = useDocument(documentId)
  const { data: comments, isLoading: commentsLoading } = useDocumentComments(documentId)

  if (isError) {
    return <p className="text-danger-text">Could not load this document.</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="truncate text-h3 text-text">{doc?.title ?? 'Document'}</h2>
      </div>

      <Group
        orientation="horizontal"
        className="flex-1 overflow-hidden rounded-lg border border-border"
      >
        <Panel defaultSize="65" minSize="40" className="bg-surface">
          <DocumentEditor projectId={projectId} documentId={documentId} />
        </Panel>
        <Separator className="w-1.5 bg-border transition-colors hover:bg-brand-subtle" />
        <Panel defaultSize="35" minSize="25">
          <div className="h-full overflow-y-auto p-4">
            <DocumentCommentsPanel
              documentId={documentId}
              comments={comments}
              isLoading={commentsLoading}
            />
          </div>
        </Panel>
      </Group>
    </div>
  )
}
