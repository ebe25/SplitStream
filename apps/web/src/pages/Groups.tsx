import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession, useUserId } from '../auth'
import { supabase, type Group } from '../supabase'
import { btn, card, errorCls, Header, input, labelCls } from '../ui'

export function Groups() {
  const userId = useUserId()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = () =>
    supabase.from('groups').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setGroups(data ?? []))

  useEffect(() => { load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('groups').insert({ name, created_by: userId })
    if (error) return setError(error.message)
    setName('')
    load()
  }

  if (groups === null) return <p className="p-8 text-center text-zinc-500">Loading…</p>

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Header title="Groups" />

      {groups.length === 0 ? (
        <Onboarding onCreate={create} name={name} setName={setName} error={error} />
      ) : (
        <>
          <ul className="space-y-2">
            {groups.map(g => (
              <li key={g.id}>
                <Link to={`/group/${g.id}`} className={`${card} flex items-center justify-between transition hover:border-indigo-400`}>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-zinc-400">
                    {g.status !== 'active' && <small className="mr-2 text-xs">{g.status}</small>}→
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="mt-4 flex gap-2">
            <input required placeholder="New group name" className={input} value={name} onChange={e => setName(e.target.value)} />
            <button className={btn}>Create</button>
          </form>
          {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
        </>
      )}
    </main>
  )
}

function Onboarding(props: {
  onCreate: (e: React.FormEvent) => void
  name: string
  setName: (v: string) => void
  error: string
}) {
  const { session } = useSession()
  const userId = useUserId()
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('display_name').eq('id', userId).single()
      .then(({ data }) => setDisplayName(data?.display_name ?? ''))
  }, [userId])

  const saveName = () =>
    supabase.from('profiles').update({ display_name: displayName || null }).eq('id', userId).then(() => {})

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-lg font-semibold">
          Welcome{session?.user.email ? `, ${session.user.email.split('@')[0]}` : ''} 👋
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Three steps and you're splitting expenses with your housemates.
        </p>
      </div>

      <div className={card}>
        <p className={labelCls}>1 · Your name (what friends will see)</p>
        <div className="mt-2 flex gap-2">
          <input className={input} placeholder="e.g. Vedansh" value={displayName} onChange={e => setDisplayName(e.target.value)} onBlur={saveName} />
        </div>
      </div>

      <form onSubmit={props.onCreate} className={card}>
        <p className={labelCls}>2 · Create your first group</p>
        <div className="mt-2 flex gap-2">
          <input required className={input} placeholder="e.g. Flat 402" value={props.name} onChange={e => props.setName(e.target.value)} />
          <button className={btn}>Create</button>
        </div>
        {props.error && <p className={`${errorCls} mt-2`} role="alert">{props.error}</p>}
      </form>

      <div className={`${card} text-sm text-zinc-500`}>
        <p className={labelCls}>3 · Invite people</p>
        <p className="mt-2">
          Open your group and tap <em>Copy invite link</em> — anyone with the link joins in one tap.
          Got a link from a friend instead? Just open it.
        </p>
      </div>
    </div>
  )
}
