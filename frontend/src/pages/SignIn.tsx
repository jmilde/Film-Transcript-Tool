import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { BigHeart, LoginHearts } from '../components/LoginHearts'

export function SignIn() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden">
      <LoginHearts />
      <form
        onSubmit={onSubmit}
        className="relative w-80 space-y-4 rounded-2xl border border-glass-line bg-glass-strong p-6 pt-14 shadow-xl backdrop-blur-md"
      >
        <BigHeart />
        <h1 className="login-title text-center text-h3">Film Transcript Tool</h1>
        <label className="block text-body">
          <span className="text-text-muted">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-body">
          <span className="text-text-muted">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full"
          />
        </label>
        {error && <p className="text-body text-danger-text">{error}</p>}
        <Button type="submit" disabled={busy} className="login-button w-full">
          {busy ? 'Signing in…' : 'Sign in ♥'}
        </Button>
      </form>
    </div>
  )
}
