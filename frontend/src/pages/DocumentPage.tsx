import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ArrowLeft as BackIcon, X as CloseIcon } from 'lucide-react'
import { useDeleteDocument, useDocument, useDocuments } from '../api/hooks/useDocuments'
import { useDocumentComments } from '../api/hooks/useComments'
import { useProject } from '../api/hooks/useProjects'
import { useDocumentPanelStore } from '../store/documentPanel'
import { DocumentEditor } from '../features/documents/DocumentEditor'
import { DocumentTabStrip } from '../features/documents/DocumentTabStrip'
import { DocumentCommentsPanel } from '../features/documents/DocumentCommentsPanel'
import { ClipPreviewPlayer } from '../features/documents/ClipPreviewPlayer'

export function DocumentPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  if (!projectId || !documentId) return null
  return <DocumentPageInner key={documentId} projectId={projectId} documentId={documentId} />
}

/**
 * A document's fullscreen, focused view — the document itself gets real
 * width instead of the docked panel's narrow column, with its comments laid
 * out in a side panel the same way `VideoWorkspace` does for a transcript's
 * comments. Reachable via the "Open fullscreen" header button on the docked
 * `DocumentPanel`; that panel keeps working independently of this page (both
 * can be open on the same document at once, since they just share the same
 * `DocumentEditor`/comments state through TanStack Query + `useCommentsStore`).
 *
 * Shares `store/documentPanel.ts`'s tab state with the docked panel (rather
 * than keeping its own), so the same documents show as open tabs in both
 * places — the only difference is that activating/opening a tab here
 * navigates to that document's own URL instead of just flipping local state.
 */
function DocumentPageInner({ projectId, documentId }: { projectId: string; documentId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isError } = useDocument(documentId)
  const { data: comments, isLoading: commentsLoading } = useDocumentComments(documentId)
  const { data: project } = useProject(projectId)

  // Where "Open fullscreen" was clicked from, carried here as router state by
  // `DocumentPanel` — the docked panel it was opened from isn't always a bare
  // project page (it can be a video or the chat page too), so the back
  // button must go back to *that* page, not always assume the project. Falls
  // back to the project itself when this route was reached some other way
  // (a direct link, or a full page reload, which router state doesn't
  // survive).
  const origin = location.state as { originLabel?: string | null; originPath?: string } | null
  const backLabel = origin?.originLabel ?? project?.name ?? 'project'
  const backPath = origin?.originPath ?? `/projects/${projectId}`

  const setActiveProject = useDocumentPanelStore((s) => s.setActiveProject)
  const openTab = useDocumentPanelStore((s) => s.openTab)
  const closeTab = useDocumentPanelStore((s) => s.closeTab)
  const openDocumentIds = useDocumentPanelStore((s) => s.openDocumentIds)
  const activeDocumentId = useDocumentPanelStore((s) => s.activeDocumentId)
  const previewClip = useDocumentPanelStore((s) => s.previewClip)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)
  const { data: documents } = useDocuments(projectId)
  const deleteDocument = useDeleteDocument(projectId)

  // Binds this page to the same tab state the docked panel uses — leaves
  // any tabs already open (from the docked panel) alone unless the project
  // itself differs, then makes sure this URL's document is one of them and
  // is the active one.
  useEffect(() => {
    setActiveProject(projectId)
    openTab(documentId)
  }, [projectId, documentId, setActiveProject, openTab])

  // Carries `origin` along to the next document too — otherwise switching
  // tabs while in fullscreen would drop the real origin and quietly fall
  // back to "back to the project" even though the user first arrived from a
  // video or the chat page.
  function goToDocument(id: string) {
    navigate(`/projects/${projectId}/documents/${id}`, { state: origin })
  }

  function goBack() {
    navigate(backPath)
  }

  // Closing/deleting the tab this page is currently showing needs somewhere
  // else to go — the neighbor `closeTab` just activated, or back to the
  // origin if that was the last open tab.
  function handleCloseTab(id: string) {
    closeTab(id)
    if (id !== documentId) return
    const next = useDocumentPanelStore.getState().activeDocumentId
    if (next) navigate(`/projects/${projectId}/documents/${next}`, { replace: true, state: origin })
    else navigate(backPath)
  }

  function handleDeleteTab(id: string) {
    deleteDocument.mutate(id, { onSuccess: () => handleCloseTab(id) })
  }

  if (isError) {
    return <p className="text-danger-text">Could not load this document.</p>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <button
        type="button"
        onClick={goBack}
        className="mb-2 flex w-fit shrink-0 items-center gap-1.5 text-small text-text-muted hover:text-text"
      >
        <BackIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Back to {backLabel}
      </button>

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <DocumentTabStrip
          projectId={projectId}
          documents={documents}
          openDocumentIds={openDocumentIds}
          activeDocumentId={activeDocumentId}
          onActivate={goToDocument}
          onClose={handleCloseTab}
          onDelete={handleDeleteTab}
        />

        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          <Panel defaultSize="65" minSize="40" className="bg-surface">
            <DocumentEditor projectId={projectId} documentId={documentId} variant="fullscreen" />
          </Panel>
          <Separator className="w-1.5 bg-border transition-colors hover:bg-brand-subtle" />
          <Panel defaultSize="35" minSize="25">
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="relative shrink-0 border-b border-border bg-surface">
                {previewClip ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close preview"
                      title="Close preview"
                      onClick={() => setPreviewClip(null)}
                      className="absolute top-1 right-1 z-10 rounded-md bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                    <ClipPreviewPlayer
                      videoId={previewClip.videoId}
                      startTime={previewClip.startTime}
                      endTime={previewClip.endTime}
                    />
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center p-4 text-center text-small text-text-muted">
                    Play a clip from the document to preview it here.
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <DocumentCommentsPanel
                  documentId={documentId}
                  comments={comments}
                  isLoading={commentsLoading}
                />
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  )
}
