import { useState } from 'react'

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  onResetPassword: (email: string) => Promise<void>
}

type Mode = 'signin' | 'signup' | 'reset'

export default function AuthPage({ onSignIn, onSignUp, onResetPassword }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (mode === 'signin') {
        await onSignIn(email, password)
      } else if (mode === 'signup') {
        await onSignUp(email, password)
        setSuccess('Account created! Check your email to confirm, then sign in.')
      } else {
        await onResetPassword(email)
        setSuccess('Password reset email sent.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#05060F] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">FlowMetrics</h1>
          <p className="text-sm text-slate-400">Budget & Cash Flow Tracker</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ backgroundColor: '#1e293b', color: '#f1f5f9', WebkitTextFillColor: '#f1f5f9' }}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />

            {mode !== 'reset' && (
              <input
                type="password"
                placeholder="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ backgroundColor: '#1e293b', color: '#f1f5f9', WebkitTextFillColor: '#f1f5f9' }}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-emerald-400">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-slate-900 transition"
            >
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset email'}
            </button>
          </form>

          <div className="flex flex-col gap-1 text-center text-xs text-slate-400">
            {mode === 'signin' && (
              <>
                <button onClick={() => setMode('signup')} className="hover:text-slate-200 transition">
                  No account? Create one
                </button>
                <button onClick={() => setMode('reset')} className="hover:text-slate-200 transition">
                  Forgot password?
                </button>
              </>
            )}
            {mode !== 'signin' && (
              <button onClick={() => setMode('signin')} className="hover:text-slate-200 transition">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
