import { useEffect, useState } from 'react'
import { Loading } from './anim'
import { useUserId } from './auth'
import { supabase } from './supabase'
import { btn, btnGhost, card, errorCls, input } from './ui'

export type UserVpa = { id: string; vpa: string }

// name@handle — loose on purpose; the bank rejects what we can't
const VPA_RE = /^[\w.-]+@[\w-]+$/

export function useVpas() {
  const userId = useUserId()
  const [vpas, setVpas] = useState<UserVpa[] | null>(null)
  const load = () =>
    supabase.from('user_vpas').select('id, vpa').order('created_at')
      .then(({ data }) => setVpas(data ?? []))
  useEffect(() => { if (userId) load() }, [userId])
  return { vpas, load }
}

// profiles.upi_vpa stays the "primary" (pay deep-links read it): oldest VPA wins
async function syncPrimary(userId: string) {
  const { data } = await supabase.from('user_vpas').select('vpa').order('created_at').limit(1)
  await supabase.from('profiles').update({ upi_vpa: data?.[0]?.vpa ?? null }).eq('id', userId)
}

export function VpaEditor({ vpas, onChange }: { vpas: UserVpa[]; onChange: () => void }) {
  const userId = useUserId()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const vpa = value.trim().toLowerCase()
    if (!VPA_RE.test(vpa)) return setError('That doesn’t look like a UPI ID (name@bank)')
    setError('')
    const { error } = await supabase.from('user_vpas').insert({ user_id: userId, vpa })
    if (error && error.code !== '23505') return setError(error.message)
    setValue('')
    await syncPrimary(userId)
    onChange()
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('user_vpas').delete().eq('id', id)
    if (error) return setError(error.message)
    await syncPrimary(userId)
    onChange()
  }

  return (
    <div className="space-y-3">
      {vpas.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {vpas.map(v => (
            <li key={v.id} className="flex items-center gap-1 rounded-full bg-pine-soft px-3 py-1 text-sm">
              <span className="font-mono">{v.vpa}</span>
              <button
                type="button"
                aria-label={`Remove ${v.vpa}`}
                className="ml-1 text-muted transition hover:text-neg"
                onClick={() => remove(v.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          className={input}
          placeholder="you@okhdfcbank"
          aria-label="UPI ID"
          autoCapitalize="none"
          autoCorrect="off"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button className={btn}>Add</button>
      </form>
      {error && <p className={errorCls} role="alert">{error}</p>}
    </div>
  )
}

const SKIP_KEY = 'vpa-setup-skipped'

// Post-login gate: until the user has at least one UPI ID (or skips), the app
// waits — settlement matching is blind without them.
export function RequireVpa({ children }: { children: React.ReactNode }) {
  const { vpas, load } = useVpas()
  const [skipped, setSkipped] = useState(() => localStorage.getItem(SKIP_KEY) === '1')

  if (vpas === null) return <Loading />
  if (vpas.length > 0 || skipped) return <>{children}</>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <div className={`${card} space-y-3`}>
        <h2 className="font-display text-xl font-bold tracking-tight">Your UPI IDs</h2>
        <p className="text-sm text-muted">
          SplitStream recognises settle-up payments by UPI ID. Add every ID you pay
          with — GPay, PhonePe, Paytm… — so friends’ payments match automatically.
        </p>
        <VpaEditor vpas={vpas} onChange={load} />
        <button
          className={`${btnGhost} w-full`}
          onClick={() => { localStorage.setItem(SKIP_KEY, '1'); setSkipped(true) }}
        >
          Skip for now — I’ll add them in Settings
        </button>
      </div>
    </main>
  )
}
