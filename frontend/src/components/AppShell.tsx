import { useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { Moon, Search as SearchIcon, Sun } from 'lucide-react'
import { DocumentPanel } from '../features/documents/DocumentPanel'
import { useProject } from '../api/hooks/useProjects'
import { useVideo } from '../api/hooks/useVideos'
import { useDocument } from '../api/hooks/useDocuments'
import { useSearchOverlayStore } from '../store/searchOverlay'
import { useThemeStore } from '../store/theme'
import { SearchCommandPalette } from '../features/search/SearchCommandPalette'
import { Breadcrumb } from './ui/Breadcrumb'
import type { BreadcrumbItem } from './ui/Breadcrumb'
import { Button } from './ui/Button'
import { UserMenu } from './UserMenu'

/**
 * Top-level chrome: uniform header (breadcrumb, global Search/Ask, theme
 * toggle, sign out) + the routed main workspace, with the document-builder
 * panel docked as a resizable sibling `Panel` (of the same `Group` as the
 * routed page) so it stays mounted across navigation instead of resetting
 * per page, and resizes/collapses like any other panel rather than living
 * outside the resizable-panel system entirely.
 */
export function AppShell() {
  const navigate = useNavigate()
  // Owned here (not inside `DocumentPanel`) because the `Panel` element
  // itself lives here — `DocumentPanel` bridges its `isOpen` store flag to
  // this handle's `collapse()`/`expand()`.
  const documentPanelRef = usePanelRef()

  // `useParams` at this layout-route level reports whichever of these the
  // currently matched leaf route carries — no prop-drilling from the page.
  const {
    projectId: routeProjectId,
    videoId,
    documentId,
  } = useParams<{
    projectId?: string
    videoId?: string
    documentId?: string
  }>()
  const { data: video } = useVideo(videoId ?? null)
  // Named to avoid shadowing the global `document` (used below for the
  // ⌘F keydown listener) within this component's scope.
  const { data: activeDocument } = useDocument(documentId ?? null)
  // A video's own route has no :projectId param — the video always knows
  // its project once loaded, so the header still resolves one even when a
  // user lands on a video directly from Search/Chat.
  const effectiveProjectId = routeProjectId ?? video?.project_id ?? null
  const { data: project } = useProject(effectiveProjectId ?? undefined)
  const location = useLocation()
  // Chat has no :videoId param, so it's otherwise indistinguishable from the
  // bare ProjectView route below — this is what lets the project crumb know
  // it isn't the current page there (see the dead-end fix below).
  const isChatPage = location.pathname.includes('/chat')
  // No project in scope (the Projects list) has nothing for the panel to
  // operate on; the fullscreen document route (:documentId) is that same
  // document's own dedicated layout, so docking it alongside would just be
  // a redundant second copy of the same editor.
  const showDocumentPanel = Boolean(effectiveProjectId) && !documentId

  // What "Open fullscreen" on the docked panel should say/do when it comes
  // back — the docked panel can be open on a video page or a chat page just
  // as easily as a bare project page, so the fullscreen document route can't
  // assume "back" always means the project itself. This is exactly the
  // current page's own crumb (video name / "Ask" / project name) plus its
  // URL, handed down so `DocumentPanel` can carry it as router `state`.
  const originLabel = videoId && video ? video.name : isChatPage ? 'Ask' : (project?.name ?? null)

  // `Breadcrumb` always renders its last item as plain "current page" text —
  // so every route that sits *under* the project (a video, or chat) must add
  // its own trailing crumb, or the project item would wrongly render as
  // non-clickable "current" text and strand the user with no way back up
  // (this happened on `/chat`, which used to push only the project crumb).
  // Folder ancestors are linkable because `video.folder_path` now carries
  // each folder's id, not just its name — see `ProjectView`'s
  // `/projects/:projectId/folders/:folderId` route.
  const breadcrumbItems: BreadcrumbItem[] = []
  if (effectiveProjectId) {
    breadcrumbItems.push({
      label: project?.name ?? '…',
      href: `/projects/${effectiveProjectId}`,
    })
    if (videoId && video) {
      for (const folder of video.folder_path) {
        breadcrumbItems.push({
          label: folder.name,
          href: `/projects/${effectiveProjectId}/folders/${folder.id}`,
        })
      }
      breadcrumbItems.push({ label: video.name })
    } else if (documentId && activeDocument) {
      breadcrumbItems.push({ label: activeDocument.title })
    } else if (isChatPage) {
      breadcrumbItems.push({ label: 'Ask' })
    }
  }

  const openSearch = useSearchOverlayStore((s) => s.open)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (effectiveProjectId) openSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [effectiveProjectId, openSearch])

  const isDark = useThemeStore((s) => s.isDark)
  const toggleTheme = useThemeStore((s) => s.toggle)

  return (
    <div className="flex h-screen flex-col bg-page text-text">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
        <Link to="/" className="text-h3 whitespace-nowrap hover:opacity-80">
          Film Transcript Tool
        </Link>
        {breadcrumbItems.length > 0 && <Breadcrumb items={breadcrumbItems} />}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!effectiveProjectId}
            onClick={() => openSearch()}
          >
            <SearchIcon className="h-4 w-4" aria-hidden="true" />
            Search <span className="text-text-muted">⌘F</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!effectiveProjectId}
            onClick={() =>
              effectiveProjectId && void navigate(`/projects/${effectiveProjectId}/chat`)
            }
          >
            Ask
          </Button>
          <Button variant="ghost" size="sm" aria-label="Toggle theme" onClick={() => toggleTheme()}>
            {isDark ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <UserMenu />
        </div>
      </header>
      {/* The docked document panel is its own "sidebar" — it has nothing to
          operate on outside a project (the Projects list) and would only
          duplicate the fullscreen document page's own layout while looking
          at a document there, so it's not just disabled but not rendered at
          all in either place. `key`ing the `Group` on this forces
          react-resizable-panels to re-mount with the right panel count
          instead of trying to reconcile a changed child list in place. */}
      {showDocumentPanel ? (
        <Group key="with-document-panel" orientation="horizontal" className="flex-1 overflow-hidden">
          <Panel defaultSize="75" minSize="40">
            <main className="h-full overflow-auto px-6 py-8">
              <Outlet />
            </main>
          </Panel>
          <Separator className="w-1.5 bg-border transition-colors hover:bg-brand-subtle" />
          {/* `collapsedSize` (40px) matches the rail-button width `DocumentPanel`
              renders in its collapsed state, so the panel is never a sliver
              narrower than its own toggle button. */}
          {/* A percentage minSize can still resolve to an unusably narrow panel
              on a smaller/split browser window (the toolbar buttons and
              document switcher row need real horizontal room) — a fixed pixel
              floor guarantees a working width regardless of window size. */}
          <Panel
            panelRef={documentPanelRef}
            collapsible
            collapsedSize={40}
            defaultSize="25"
            minSize={320}
          >
            <DocumentPanel
              panelRef={documentPanelRef}
              originLabel={originLabel}
              originPath={location.pathname}
            />
          </Panel>
        </Group>
      ) : (
        <main className="h-full flex-1 overflow-auto px-6 py-8">
          <Outlet />
        </main>
      )}
      <SearchCommandPalette projectId={effectiveProjectId} />
    </div>
  )
}
