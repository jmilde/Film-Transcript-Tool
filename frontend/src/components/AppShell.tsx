import { Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { DocumentPanel } from '../features/documents/DocumentPanel'

/**
 * Top-level chrome: navigation bar + the routed main workspace, with the
 * document-builder panel docked as a sibling column so it stays mounted
 * across navigation instead of resetting per page.
 */
export function AppShell() {
  const { session, signOut } = useAuth()

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
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto px-6 py-8">
          <Outlet />
        </main>
        <DocumentPanel />
      </div>
    </div>
  )
}
