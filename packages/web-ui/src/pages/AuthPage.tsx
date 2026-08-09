import { useState, type FormEvent } from 'react'
import { Bot } from 'lucide-react'
import { bootstrap, login, SubpolarApiError, type SubpolarUser } from '@/lib/subpolar-api'

export type AuthMode = 'login' | 'bootstrap'

export function AuthPage({ mode, onAuthenticated }: { mode: AuthMode; onAuthenticated: (user: SubpolarUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isBootstrap = mode === 'bootstrap'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onAuthenticated((isBootstrap ? await bootstrap(username, password) : await login(username, password)).user)
    } catch (reason) {
      setError(
        reason instanceof SubpolarApiError && reason.status === 401
          ? 'Invalid username or password.'
          : 'Could not authenticate.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="setup-page flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="setup-card w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <Bot className="setup-icon mb-5 rounded-xl p-2" size={38} />
        <h1 className="text-2xl font-semibold">{isBootstrap ? 'Create administrator' : 'Welcome back'}</h1>
        <p className="setup-copy mb-6 mt-2">Private Subpolar workspace.</p>
        <input
          value={username}
          onChange={event => setUsername(event.target.value)}
          required
          minLength={3}
          placeholder="Username"
          className="setup-input mb-3 w-full"
        />
        <input
          value={password}
          onChange={event => setPassword(event.target.value)}
          type="password"
          required
          minLength={8}
          placeholder="Password"
          className="setup-input mb-4 w-full"
        />
        {error && (
          <p role="alert" className="setup-error mb-4">
            {error}
          </p>
        )}
        <button disabled={busy} className="setup-primary w-full">
          {busy ? 'Working...' : isBootstrap ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
