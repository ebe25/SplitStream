import { computeSplits, normalizeCounterparty, toPaise, toRupees } from '@splitstream/shared'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUserId } from '../auth'
import { supabase, type Group } from '../supabase'
import { btn, btnGhost, card, errorCls, formatINR, Header, input } from '../ui'

type Txn = {
  id: string; direction: string; amount: number; counterparty_raw: string | null
  occurred_at: string; routed_status: string
}
type Payload = { member_user_id?: string; group_ids?: string[]; expense_id?: string; group_id?: string }
type ReviewItem = {
  id: string; kind: string; created_at: string
  payload: Payload | null
  transactions: Txn | null
  raw_sms: { sender: string; body: string } | null
}

const resolveItem = (id: string) =>
  supabase.from('review_items').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)

const autoApplied = new Set<string>() // ponytail: guards StrictMode double-effect on deep-link auto-apply

export function Inbox() {
  const userId = useUserId()
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [params] = useSearchParams()

  const load = () =>
    supabase.from('review_items').select('*, transactions(*), raw_sms(sender, body)')
      .eq('status', 'open').order('created_at', { ascending: false })
      .then(({ data }) => setItems((data as unknown as ReviewItem[]) ?? []))

  useEffect(() => {
    const itemId = params.get('item')
    const action = params.get('action')
    const auto = itemId && (action === 'personal' || action === 'ignore') && !autoApplied.has(itemId)
      ? (autoApplied.add(itemId),
        supabase.from('review_items').select('transactions(*)').eq('id', itemId).eq('status', 'open').single()
          .then(async ({ data }) => {
            const t = (data as unknown as { transactions: Txn | null } | null)?.transactions
            if (!t) return
            if (action === 'personal')
              await supabase.from('personal_expenses').insert({
                user_id: userId, amount: t.amount, description: t.counterparty_raw, occurred_at: t.occurred_at,
              })
            await supabase.from('transactions').update({ routed_status: action === 'personal' ? 'personal' : 'ignored' }).eq('id', t.id)
            await resolveItem(itemId)
          }))
      : Promise.resolve()
    auto.then(load)
    supabase.from('groups').select('*').then(({ data }) => setGroups(data ?? []))
  }, [])

  if (items === null) return <p className="p-8 text-center text-muted">Loading…</p>

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Header title="Inbox" />
      <ul className={`${card} divide-y divide-line/60`}>
        {items.map(i => {
          if (i.kind === 'parse_failed') return <SmsItem key={i.id} item={i} onDone={load} />
          if (i.kind === 'choose_group') return <ChooseGroupItem key={i.id} item={i} groups={groups} />
          if (i.kind === 'member_credit') return <MemberCreditItem key={i.id} item={i} groups={groups} onDone={load} />
          if (i.kind === 'pending_split') return <PendingSplitItem key={i.id} item={i} groups={groups} onDone={load} />
          return <TxnItem key={i.id} item={i} groups={groups} onDone={load} />
        })}
        {items.length === 0 && (
          <li className="py-2 text-sm text-muted">Inbox zero ✓ — transactions from your bank SMS will appear here.</li>
        )}
      </ul>
    </main>
  )
}

function TxnItem({ item, groups, onDone }: { item: ReviewItem; groups: Group[]; onDone: () => void }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null) // null = actions row, string = category input open
  const [always, setAlways] = useState(false)
  const [error, setError] = useState('')
  const t = item.transactions
  if (!t) return null

  const learnRule = (action: string, extra?: { category?: string | null; group_id?: string }) =>
    always
      ? supabase.from('rules').upsert(
          { user_id: userId, match_key: normalizeCounterparty(t.counterparty_raw), action, ...extra },
          { onConflict: 'user_id,match_key' },
        )
      : Promise.resolve()

  const toPersonal = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('personal_expenses').insert({
      user_id: userId, amount: t.amount, category: category || null,
      description: t.counterparty_raw, occurred_at: t.occurred_at,
    })
    if (error) return setError(error.message)
    await learnRule('personal', { category: category || null })
    await supabase.from('transactions').update({ routed_status: 'personal' }).eq('id', t.id)
    await resolveItem(item.id)
    onDone()
  }

  const toGroup = async (gid: string) => {
    const { error } = await supabase.from('transactions').update({ routed_status: 'group' }).eq('id', t.id)
    if (error) return setError(error.message)
    await learnRule('group', { group_id: gid })
    await resolveItem(item.id)
    navigate(`/group/${gid}/expense/new?${new URLSearchParams({ amount: String(t.amount), description: t.counterparty_raw ?? '' })}`)
  }

  const ignore = async () => {
    const { error } = await supabase.from('transactions').update({ routed_status: 'ignored' }).eq('id', t.id)
    if (error) return setError(error.message)
    await learnRule('ignore')
    await resolveItem(item.id)
    onDone()
  }

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between text-sm">
        <span>{t.counterparty_raw ?? 'Unknown'}</span>
        <strong className={`text-base tabular-nums ${t.direction === 'debit' ? 'text-neg' : 'text-pos'}`}>
          {t.direction === 'debit' ? '−' : '+'}₹{formatINR(t.amount)}
        </strong>
      </div>
      <p className="text-xs text-faint">{new Date(t.occurred_at).toLocaleString()}</p>
      {category === null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className={btnGhost} onClick={() => setCategory('')}>Personal</button>
          <select
            aria-label="Route to group" className={`${input} w-auto flex-none`}
            value="" onChange={e => e.target.value && toGroup(e.target.value)}
          >
            <option value="" disabled>Group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className={btnGhost} onClick={ignore}>Ignore</button>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-pine" checked={always} onChange={e => setAlways(e.target.checked)} />
            Always do this
          </label>
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

function ChooseGroupItem({ item, groups }: { item: ReviewItem; groups: Group[] }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const t = item.transactions
  if (!t) return null
  const choices = groups.filter(g => item.payload?.group_ids?.includes(g.id))

  const choose = async (gid: string) => {
    const { error } = await supabase.from('transactions').update({ routed_status: 'group' }).eq('id', t.id)
    if (error) return setError(error.message)
    await resolveItem(item.id)
    navigate(`/group/${gid}/expense/new?${new URLSearchParams({ amount: String(t.amount), description: t.counterparty_raw ?? '' })}`)
  }

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between text-sm">
        <span>{t.counterparty_raw ?? 'Unknown'} — which group?</span>
        <strong className={`text-base tabular-nums ${t.direction === 'debit' ? 'text-neg' : 'text-pos'}`}>
          {t.direction === 'debit' ? '−' : '+'}₹{formatINR(t.amount)}
        </strong>
      </div>
      <p className="text-xs text-faint">{new Date(t.occurred_at).toLocaleString()}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map(g => <button key={g.id} className={btnGhost} onClick={() => choose(g.id)}>{g.name}</button>)}
      </div>
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
    </li>
  )
}

function MemberCreditItem({ item, groups, onDone }: { item: ReviewItem; groups: Group[]; onDone: () => void }) {
  const userId = useUserId()
  const [name, setName] = useState('…')
  const [error, setError] = useState('')
  const t = item.transactions
  const p = item.payload

  useEffect(() => {
    if (p?.member_user_id)
      supabase.from('profiles').select('display_name').eq('id', p.member_user_id).single()
        .then(({ data }) => setName(data?.display_name ?? 'a member'))
  }, [p?.member_user_id])

  if (!t || !p?.member_user_id) return null
  const choices = groups.filter(g => p.group_ids?.includes(g.id))

  const record = async (gid: string) => {
    const { error } = await supabase.from('settlements').insert({
      group_id: gid, from_user: p.member_user_id, to_user: userId, amount: t.amount, status: 'confirmed',
    })
    if (error) return setError(error.message)
    await resolveItem(item.id)
    onDone()
  }

  const dismiss = async () => {
    const { error } = await resolveItem(item.id)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <li className="py-3">
      <p className="text-sm"><strong className="tabular-nums text-pos">₹{formatINR(t.amount)}</strong> received from <strong>{name}</strong> — probably a repayment</p>
      <p className="text-xs text-faint">{new Date(t.occurred_at).toLocaleString()}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.length === 1
          ? <button className={btn} onClick={() => record(choices[0].id)}>Record settlement</button>
          : choices.map(g => <button key={g.id} className={btn} onClick={() => record(g.id)}>Record in {g.name}</button>)}
        <button className={btnGhost} onClick={dismiss}>Dismiss</button>
      </div>
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
    </li>
  )
}

function PendingSplitItem({ item, groups, onDone }: { item: ReviewItem; groups: Group[]; onDone: () => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const t = item.transactions
  const p = item.payload
  if (!t || !p?.expense_id || !p.group_id) return null
  const group = groups.find(g => g.id === p.group_id)

  const splitEqually = async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error: mErr } = await supabase.from('group_members').select('user_id').eq('group_id', p.group_id)
      if (mErr) throw new Error(mErr.message)
      const users = (data ?? []).map(m => m.user_id)
      const splits = computeSplits(toPaise(t.amount), 'equal', users)
      const { error } = await supabase.rpc('confirm_expense_split', {
        eid: p.expense_id,
        new_splits: users.map(u => ({ user_id: u, share_amount: toRupees(splits[u]) })),
      })
      if (error) throw new Error(error.message)
      await resolveItem(item.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const custom = async () => {
    await resolveItem(item.id)
    navigate(`/group/${p.group_id}/split/${p.expense_id}`)
  }

  return (
    <li className="py-3">
      <p className="text-sm"><strong className="tabular-nums">₹{formatINR(t.amount)}</strong> in <strong>{group?.name ?? '…'}</strong> — how to split?</p>
      <p className="text-xs text-faint">{new Date(t.occurred_at).toLocaleString()}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={btn} disabled={busy} onClick={splitEqually}>{busy ? 'Splitting…' : 'Split equally'}</button>
        <button className={btnGhost} onClick={custom}>Custom…</button>
      </div>
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
      <p className="text-xs text-faint">Couldn’t parse — {item.raw_sms?.sender}</p>
      <pre className="whitespace-pre-wrap mt-1 text-sm">{item.raw_sms?.body}</pre>
      <button className={`${btnGhost} mt-2`} onClick={dismiss}>Dismiss</button>
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}
    </li>
  )
}
