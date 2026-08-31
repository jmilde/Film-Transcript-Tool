import { useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { Moon, Search as SearchIcon, Sun } from 'lucide-react'
import { useAuth } from '../auth/context'
import { DocumentPanel } from '../features/documents/DocumentPanel'
import { useProject } from '../api/hooks/useProjects'
import { useVideo } from '../api/hooks/useVideos'
import { useSearchOverlayStore } from '../store/searchOverlay'
import { useThemeStore } from '../store/theme'
import { SearchCommandPalette } from '../features/search/SearchCommandPalette'
import { Breadcrumb } from './ui/Breadcrumb'
import type { BreadcrumbItem } from './ui/Breadcrumb'
import { Button } from './ui/Button'

/**
 * Top-level chrome: uniform header (breadcrumb, global Search/Ask, theme
 * toggle, sign out) + the routed main workspace, with the document-builder
 * panel docked as a resizable sibling `Panel` (of the same `Group` as the
 * routed page) so it stays mounted across navigation instead of resetting
 * per page, and resizes/collapses like any other panel rather than living
 * outside the resizable-panel system entirely.
 */
export function AppShell() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  // Owned here (not inside `DocumentPanel`) because the `Panel` element
  // itself lives here — `DocumentPanel` bridges its `isOpen` store flag to
  // this handle's `collapse()`/`expand()`.
  const documentPanelRef = usePanelRef()

  // `useParams` at this layout-route level reports whichever of these the
  // currently matched leaf route carries — no prop-drilling from the page.
  const { projectId: routeProjectId, videoId } = useParams<{
    projectId?: string
    videoId?: string
  }>()
  const { data: video } = useVideo(videoId ?? null)
  // A video's own route has no :projectId param — the video always knows
  // its project once loaded, so the header still resolves one even when a
  // user lands on a video directly from Search/Chat.
  const effectiveProjectId = routeProjectId ?? video?.project_id ?? null
  const { data: project } = useProject(effectiveProjectId ?? undefined)

  // Folder selection in ProjectView is local component state, not part of
  // the URL, so a Folder crumb only ever resolves here, via the video's own
  // folder_path (Phase 5). Project-only routes (Projects/ProjectView/Chat)
  // render just the one crumb — Breadcrumb renders it as plain text since
  // it's always the last item there.
  const breadcrumbItems: BreadcrumbItem[] = []
  if (effectiveProjectId) {
    breadcrumbItems.push({
      label: project?.name ?? '…',
      href: `/projects/${effectiveProjectId}`,
    })
    if (videoId && video) {
      for (const folder of video.folder_path) breadcrumbItems.push({ label: folder })
      breadcrumbItems.push({ label: video.name })
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
        <span className="text-h3 whitespace-nowrap">Film Transcript Tool</span>
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
          <span className="text-small text-text-muted">{session?.user.email}</span>
          <Button variant="secondary" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
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
          <DocumentPanel panelRef={documentPanelRef} />
        </Panel>
      </Group>
      <SearchCommandPalette projectId={effectiveProjectId} />
    </div>
  )
}
