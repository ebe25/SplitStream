import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserId } from '../auth'
import { supabase, type Group } from '../supabase'
import { btn, btnGhost, card, errorCls, Header, input } from '../ui'

type Txn = {
  id: string; direction: string; amount: number; counterparty_raw: string | null
  occurred_at: string; routed_status: string
}
type ReviewItem = {
  id: string; kind: string; created_at: string
  transactions: Txn | null
  raw_sms: { sender: string; body: string } | null
}

const resolveItem = (id: string) =>
  supabase.from('review_items').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)

export function Inbox() {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])

  const load = () =>
    supabase.from('review_items').select('*, transactions(*), raw_sms(sender, body)')
      .eq('status', 'open').order('created_at', { ascending: false })
      .then(({ data }) => setItems((data as unknown as ReviewItem[]) ?? []))

  useEffect(() => {
    load()
    supabase.from('groups').select('*').then(({ data }) => setGroups(data ?? []))
  }, [])

  if (items === null) return <p className="p-8 text-center text-zinc-500">Loading…</p>

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Header title="Inbox" />
      <ul className={`${card} divide-y divide-zinc-100 dark:divide-zinc-800`}>
        {items.map(i => i.kind === 'parse_failed'
          ? <SmsItem key={i.id} item={i} onDone={load} />
          : <TxnItem key={i.id} item={i} groups={groups} onDone={load} />)}
        {items.length === 0 && (
          <li className="py-2 text-sm text-zinc-500">Inbox zero ✓ — transactions from your bank SMS will appear here.</li>
        )}
      </ul>
    </main>
  )
}

function TxnItem({ item, groups, onDone }: { item: ReviewItem; groups: Group[]; onDone: () => void }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null) // null = actions row, string = category input open
  const [error, setError] = useState('')
  const t = item.transactions
  if (!t) return null

  const toPersonal = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('personal_expenses').insert({
      user_id: userId, amount: t.amount, category: category || null,
      description: t.counterparty_raw, occurred_at: t.occurred_at,
    })
    if (error) return setError(error.message)
    await supabase.from('transactions').update({ routed_status: 'personal' }).eq('id', t.id)
    await resolveItem(item.id)
    onDone()
  }

  const toGroup = async (gid: string) => {
    const { error } = await supabase.from('transactions').update({ routed_status: 'group' }).eq('id', t.id)
    if (error) return setError(error.message)
    await resolveItem(item.id)
    navigate(`/group/${gid}/expense/new?${new URLSearchParams({ amount: String(t.amount), description: t.counterparty_raw ?? '' })}`)
  }

  const ignore = async () => {
    const { error } = await supabase.from('transactions').update({ routed_status: 'ignored' }).eq('id', t.id)
    if (error) return setError(error.message)
    await resolveItem(item.id)
    onDone()
  }

  return (
    <li className="py-3">
      <div className="flex justify-between text-sm">
        <span>{t.counterparty_raw ?? 'Unknown'}</span>
        <strong className="tabular-nums">{t.direction === 'debit' ? '−' : '+'}₹{t.amount}</strong>
      </div>
      <p className="text-xs text-zinc-400">{new Date(t.occurred_at).toLocaleString()}</p>
      {category === null ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => setCategory('')}>Personal</button>
          <select
            aria-label="Route to group" className={`${input} w-auto flex-none`}
            value="" onChange={e => e.target.value && toGroup(e.target.value)}
          >
            <option value="" disabled>Group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className={btnGhost} onClick={ignore}>Ignore</button>
        </div>
      ) : (
        <form onSubmit={toPersonal} className="mt-2 flex gap-2">
          <input autoFocus placeholder="Category" aria-label="Category" className={input} value={category} onChange={e => setCategory(e.target.value)} />
          <button className={btn}>Confirm</button>
        </form>
      )}
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
    </li>
  )
}

function SmsItem({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const [error, setError] = useState('')

  const dismiss = async () => {
    const { error } = await resolveItem(item.id)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <li className="py-3">
      <p className="text-xs text-zinc-400">Couldn’t parse — {item.raw_sms?.sender}</p>
      <pre className="whitespace-pre-wrap mt-1 text-sm">{item.raw_sms?.body}</pre>
      <button className={`${btnGhost} mt-2`} onClick={dismiss}>Dismiss</button>
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
    </li>
  )
}
