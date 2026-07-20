import { useEffect, useState } from 'react'
import { useUserId } from '../auth'
import { enablePush, pushEnabled } from '../push'
import { supabase, type Group, type Rule } from '../supabase'
import { btn, btnGhost, card, errorCls, Header, input, labelCls } from '../ui'

export function Settings() {
  const userId = useUserId()
  const [displayName, setDisplayName] = useState('')
  const [upiVpa, setUpiVpa] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('display_name, upi_vpa').eq('id', userId).single()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? '')
        setUpiVpa(data?.upi_vpa ?? '')
      })
  }, [userId])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('profiles')
      .update({ display_name: displayName || null, upi_vpa: upiVpa || null }).eq('id', userId)
    if (error) setError(error.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <Header title="Settings" />

      <form onSubmit={save} className={`${card} space-y-3`}>
        <div>
          <label htmlFor="name" className={labelCls}>Display name</label>
          <input id="name" className={`${input} mt-1`} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="vpa" className={labelCls}>UPI VPA <span className="font-normal text-zinc-400">(for settle-up links, Phase 3)</span></label>
          <input id="vpa" className={`${input} mt-1`} placeholder="you@upi" value={upiVpa} onChange={e => setUpiVpa(e.target.value)} />
        </div>
        <button className={btn}>{saved ? 'Saved ✓' : 'Save'}</button>
        {error && <p className={errorCls} role="alert">{error}</p>}
      </form>

      <Notifications />

      <Rules />

      <Devices />

      <div className={`${card} mt-4`}>
        <button className={`${btnGhost} w-full text-red-600 dark:text-red-400`} onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}

function Notifications() {
  const userId = useUserId()
  const [state, setState] = useState<'enabled' | 'denied' | 'unsupported' | 'off' | null>(null)

  useEffect(() => { pushEnabled().then(on => setState(on ? 'enabled' : 'off')) }, [])

  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>Notifications</p>
      {state === 'enabled' ? (
        <p className="text-sm text-zinc-500">Enabled ✓</p>
      ) : (
        <>
          <button className={btn} disabled={state === null} onClick={async () => setState(await enablePush(userId))}>
            Enable notifications
          </button>
          {state === 'denied' && (
            <p className="text-sm text-zinc-500">Blocked — allow notifications for this site in your browser settings.</p>
          )}
          {state === 'unsupported' && (
            <p className="text-sm text-zinc-500">Not supported in this browser.</p>
          )}
        </>
      )}
    </div>
  )
}

function Rules() {
  const [rules, setRules] = useState<Rule[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState('')

  const load = () =>
    supabase.from('rules').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setRules(data ?? []))

  useEffect(() => {
    load()
    supabase.from('groups').select('*').then(({ data }) => setGroups(data ?? []))
  }, [])

  const remove = async (id: string) => {
    const { error } = await supabase.from('rules').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  const detail = (r: Rule) =>
    r.action === 'personal' ? `personal${r.category ? ` · ${r.category}` : ''}`
    : r.action === 'group' ? `group · ${groups.find(g => g.id === r.group_id)?.name ?? '…'}`
    : 'ignore'

  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>Rules</p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rules.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {r.match_key}
              <div className="text-xs text-zinc-400">{detail(r)}</div>
            </span>
            <button className={`${btnGhost} text-red-600 dark:text-red-400`} onClick={() => remove(r.id)}>Delete</button>
          </li>
        ))}
        {rules.length === 0 && (
          <li className="py-2 text-sm text-zinc-500">Rules are learned when you tick 'always do this' in the inbox.</li>
        )}
      </ul>
      {error && <p className={errorCls} role="alert">{error}</p>}
    </div>
  )
}

type Device = { id: string; label: string; created_at: string; last_seen_at: string | null }

function Devices() {
  const userId = useUserId()
  const [devices, setDevices] = useState<Device[]>([])
  const [label, setLabel] = useState('')
  const [newToken, setNewToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    supabase.from('devices').select('id, label, created_at, last_seen_at').order('created_at', { ascending: false })
      .then(({ data }) => setDevices(data ?? []))

  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const token_hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    const { error } = await supabase.from('devices').insert({ user_id: userId, label, token_hash })
    if (error) return setError(error.message)
    setNewToken(token)
    setCopied(false)
    setLabel('')
    load()
  }

  const revoke = async (id: string) => {
    if (!confirm('Revoke this device? SMS from it will stop syncing.')) return
    const { error } = await supabase.from('devices').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  const copy = () => {
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>Devices</p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {devices.map(d => (
          <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {d.label}
              <div className="text-xs text-zinc-400">
                added {new Date(d.created_at).toLocaleDateString()}
                {d.last_seen_at ? ` · last seen ${new Date(d.last_seen_at).toLocaleDateString()}` : ' · never seen'}
              </div>
            </span>
            <button className={`${btnGhost} text-red-600 dark:text-red-400`} onClick={() => revoke(d.id)}>Revoke</button>
          </li>
        ))}
        {devices.length === 0 && <li className="py-2 text-sm text-zinc-500">No devices yet — add one to forward bank SMS from MacroDroid.</li>}
      </ul>
      {newToken && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Token shown once — store it in MacroDroid now.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 grow break-all font-mono text-xs">{newToken}</code>
            <button type="button" className={btnGhost} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input required placeholder="MacroDroid – Pixel" aria-label="Device label" className={input} value={label} onChange={e => setLabel(e.target.value)} />
        <button className={btn}>Add device</button>
      </form>
      {error && <p className={errorCls} role="alert">{error}</p>}
    </div>
  )
}
