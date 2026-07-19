import { Navigate, Outlet } from 'react-router'
import { useAuth } from './context'

/** Route guard: renders child routes only when signed in, else bounces to /signin. */
export function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/signin" replace />
  }
  return <Outlet />
}
