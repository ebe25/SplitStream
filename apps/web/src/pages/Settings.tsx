import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useUserId } from '../auth'
import { useInstall } from '../install'
import { enablePush, pushEnabled } from '../push'
import { supabase, type Group, type Rule } from '../supabase'
import { btn, btnGhost, card, errorCls, Header, input, labelCls } from '../ui'
import { useVpas, VpaEditor } from '../vpas'

// CI/release must publish the APK under this exact asset name.
const FORWARDER_APK_URL = 'https://github.com/ebe25/SplitStream/releases/latest/download/splitstream-forwarder.apk'

export function Settings() {
  const userId = useUserId()
  const [displayName, setDisplayName] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('display_name').eq('id', userId).single()
      .then(({ data }) => setDisplayName(data?.display_name ?? ''))
  }, [userId])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('profiles')
      .update({ display_name: displayName || null }).eq('id', userId)
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
        <button className={btn}>{saved ? 'Saved ✓' : 'Save'}</button>
        {error && <p className={errorCls} role="alert">{error}</p>}
      </form>

      <Vpas />

      <Notifications />

      <Rules />

      <Devices />

      <InstallApp />

      <GetForwarder />

      <div className={`${card} mt-4`}>
        <button className={`${btnGhost} w-full text-neg`} onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}

function Vpas() {
  const { vpas, load } = useVpas()
  if (vpas === null) return null
  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>UPI IDs <span className="font-normal text-faint">(settle-up matching + pay links)</span></p>
      <VpaEditor vpas={vpas} onChange={load} />
    </div>
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
        <p className="text-sm text-muted">Enabled ✓</p>
      ) : (
        <>
          <button className={btn} disabled={state === null} onClick={async () => setState(await enablePush(userId))}>
            Enable notifications
          </button>
          {state === 'denied' && (
            <p className="text-sm text-muted">Blocked — allow notifications for this site in your browser settings.</p>
          )}
          {state === 'unsupported' && (
            <p className="text-sm text-muted">Not supported in this browser.</p>
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
      <ul className="divide-y divide-line/60">
        {rules.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {r.match_key}
              <div className="text-xs text-faint">{detail(r)}</div>
            </span>
            <button className={`${btnGhost} text-neg`} onClick={() => remove(r.id)}>Delete</button>
          </li>
        ))}
        {rules.length === 0 && (
          <li className="py-2 text-sm text-muted">Rules are learned when you tick 'always do this' in the inbox.</li>
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
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!newToken) return setQr('')
    QRCode.toDataURL(newToken).then(setQr)
  }, [newToken])

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
      <ul className="divide-y divide-line/60">
        {devices.map(d => (
          <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {d.label}
              <div className="text-xs text-faint">
                added {new Date(d.created_at).toLocaleDateString()}
                {d.last_seen_at ? ` · last seen ${new Date(d.last_seen_at).toLocaleDateString()}` : ' · never seen'}
              </div>
            </span>
            <button className={`${btnGhost} text-neg`} onClick={() => revoke(d.id)}>Revoke</button>
          </li>
        ))}
        {devices.length === 0 && <li className="py-2 text-sm text-muted">No devices yet — add one, then scan its QR with the SplitStream forwarder to auto-capture bank SMS.</li>}
      </ul>
      {newToken && (
        <div className="rounded-xl border border-warn-ink/25 bg-warn-bg p-3">
          <p className="text-sm font-medium text-warn-ink">Token shown once — scan the QR with the forwarder app now.</p>
          {qr && (
            <div className="mt-2 flex justify-center">
              {/* white box so QR scans in dark mode */}
              <div className="rounded-xl bg-white p-2">
                <img src={qr} alt="Device token QR" width={192} height={192} />
              </div>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 grow break-all font-mono text-xs">{newToken}</code>
            <button type="button" className={btnGhost} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input required placeholder="e.g. Vedansh’s Pixel" aria-label="Device label" className={input} value={label} onChange={e => setLabel(e.target.value)} />
        <button className={btn}>Add device</button>
      </form>
      {error && <p className={errorCls} role="alert">{error}</p>}
    </div>
  )
}

function InstallApp() {
  const { canInstall, installed, isIos, promptInstall } = useInstall()
  if (installed) return null
  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>Install app</p>
      {canInstall ? (
        <button className={btn} onClick={promptInstall}>Install SplitStream</button>
      ) : isIos ? (
        <p className="text-sm text-muted">Tap Share → Add to Home Screen to install.</p>
      ) : (
        <p className="text-sm text-muted">Open in Chrome on Android to install.</p>
      )}
    </div>
  )
}

function GetForwarder() {
  return (
    <div className={`${card} mt-4 space-y-3`}>
      <p className={labelCls}>Get the forwarder</p>
      <p className="text-sm text-muted">
        Android app that forwards bank SMS automatically. Install it, then scan a new device token QR from here.
      </p>
      {/* Play Protect auto-blocks browser-downloaded SMS apps in India; installs
          via Obtainium (session-based) are exempt from that AND from Android 13+
          "restricted settings". So: Obtainium first, direct APK as fallback. */}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          Install{' '}
          <a className="font-medium text-accent underline" href="https://github.com/ImranR98/Obtainium/releases/latest" target="_blank" rel="noreferrer">
            Obtainium
          </a>{' '}
          (one time — it installs and updates apps straight from GitHub)
        </li>
        <li>
          Tap{' '}
          <a className="font-medium text-accent underline" href="obtainium://add/https://github.com/ebe25/SplitStream">
            Add SplitStream forwarder to Obtainium
          </a>
        </li>
        <li>Install from inside Obtainium, then grant SMS permission when asked</li>
      </ol>
      <a className={`${btnGhost} inline-block`} href={FORWARDER_APK_URL} download>Direct APK download</a>
      <p className="text-xs text-faint">
        Direct download may be blocked by Play Protect on Indian devices — use Obtainium if it is.
      </p>
    </div>
  )
}
