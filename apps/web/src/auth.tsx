import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { faGithub, faGoogle } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { supabase } from './supabase'
import { btn, btnGhost, card, errorCls, input, labelCls } from './ui'

const AuthCtx = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>
}

export const useSession = () => useContext(AuthCtx)
export const useUserId = () => useContext(AuthCtx).session?.user.id ?? ''

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const location = useLocation()
  if (loading) return <p className="p-8 text-center text-zinc-500">Loading…</p>
  if (!session) return <Navigate to="/auth" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

export function AuthPage() {
  const { session } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
  }

  const oauth = async (provider: 'github' | 'google') => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">
          S
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">SplitStream</h1>
        <p className="mt-1 text-sm text-zinc-500">Shared expenses, automatically captured.</p>
      </div>

      <div className={card}>
        <div className="space-y-2">
          <button type="button" className={`${btnGhost} flex w-full items-center justify-center gap-2`} onClick={() => oauth('google')}>
            <FontAwesomeIcon icon={faGoogle} aria-hidden="true" /> Continue with Google
          </button>
          <button type="button" className={`${btnGhost} flex w-full items-center justify-center gap-2`} onClick={() => oauth('github')}>
            <FontAwesomeIcon icon={faGithub} aria-hidden="true" /> Continue with GitHub
          </button>
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-400" aria-hidden="true">
          <span className="h-px grow bg-zinc-200 dark:bg-zinc-800" />
          or
          <span className="h-px grow bg-zinc-200 dark:bg-zinc-800" />
        </div>

        {!sent ? (
          <form onSubmit={send} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelCls}>Email</label>
              <input
                id="email" name="email" type="email" required autoComplete="email" spellCheck={false}
                placeholder="you@example.com" className={`${input} mt-1`}
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
            <button className={`${btn} w-full`} disabled={busy}>
              {busy ? 'Sending…' : 'Send login code'}
            </button>
            <p className="text-center text-xs text-zinc-500">No password — we email you a 6-digit code.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <div>
              <label htmlFor="code" className={labelCls}>Code sent to {email}</label>
              <input
                id="code" name="code" inputMode="numeric" pattern="\d{6}" required
                autoComplete="one-time-code" spellCheck={false} placeholder="123456"
                className={`${input} mt-1 text-center text-xl tracking-[0.4em]`}
                value={code} onChange={e => setCode(e.target.value)}
              />
            </div>
            <button className={`${btn} w-full`} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" className="w-full text-center text-sm text-indigo-600 dark:text-indigo-400" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </form>
        )}
        {error && <p className={`${errorCls} mt-3`} role="alert">{error}</p>}
      </div>
    </main>
  )
}
