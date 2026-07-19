import { Outlet } from 'react-router'
import { useAuth } from '../auth/context'

/** Top-level chrome: navigation bar + the routed main workspace. */
export function AppShell() {
  const { session, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
