import { Outlet } from 'react-router'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { useAuth } from '../auth/context'
import { DocumentPanel } from '../features/documents/DocumentPanel'

/**
 * Top-level chrome: navigation bar + the routed main workspace, with the
 * document-builder panel docked as a resizable sibling `Panel` (of the same
 * `Group` as the routed page) so it stays mounted across navigation instead
 * of resetting per page, and resizes/collapses like any other panel rather
 * than living outside the resizable-panel system entirely.
 */
export function AppShell() {
  const { session, signOut } = useAuth()
  // Owned here (not inside `DocumentPanel`) because the `Panel` element
  // itself lives here — `DocumentPanel` bridges its `isOpen` store flag to
  // this handle's `collapse()`/`expand()`.
  const documentPanelRef = usePanelRef()

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <span className="font-semibold text-slate-800">Film Transcript Tool</span>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{session?.user.email}</span>
          <button
            onClick={() => signOut()}
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize="75" minSize="40">
          <main className="h-full overflow-auto px-6 py-8">
            <Outlet />
          </main>
        </Panel>
        <Separator className="w-1.5 bg-slate-200 transition-colors hover:bg-slate-300" />
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
    </div>
  )
}
