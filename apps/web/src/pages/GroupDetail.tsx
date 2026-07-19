import { toRupees } from '@splitstream/shared'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUserId } from '../auth'
import { supabase, type Balance, type Debt, type Group } from '../supabase'
import { btn, btnGhost, card, errorCls, Header } from '../ui'

type Member = { user_id: string; profiles: { display_name: string | null } | null }
type Expense = {
  id: string; description: string | null; amount: number; paid_by: string
  occurred_at: string; expense_splits: { user_id: string; share_amount: number }[]
}
type Settlement = { id: string; from_user: string; to_user: string; amount: number; status: string }

export function GroupDetail() {
  const { id } = useParams()
  const userId = useUserId()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const [g, m, e, s, b, d] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('user_id, profiles(display_name)').eq('group_id', id),
      supabase.from('expenses').select('*, expense_splits(user_id, share_amount)')
        .eq('group_id', id).order('occurred_at', { ascending: false }),
      supabase.from('settlements').select('*').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.rpc('group_balances', { gid: id }),
      supabase.rpc('simplified_debts', { gid: id }),
    ])
    setGroup(g.data)
    setMembers((m.data as unknown as Member[]) ?? [])
    setExpenses(e.data ?? [])
    setSettlements(s.data ?? [])
    setBalances(b.data ?? [])
    setDebts(d.data ?? [])
    const err = g.error ?? m.error ?? e.error ?? s.error ?? b.error ?? d.error
    setError(err ? err.message : '')
  }, [id])

  useEffect(() => { load() }, [load])

  const name = (uid: string) =>
    uid === userId ? 'You' : members.find(m => m.user_id === uid)?.profiles?.display_name ?? '…'

  const recordSettlement = async (debt: Debt) => {
    const { error } = await supabase.from('settlements').insert({
      group_id: id, from_user: debt.from_user, to_user: debt.to_user,
      amount: debt.amount, status: 'confirmed',
    })
    if (error) setError(error.message)
    else load()
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}/join/${group?.invite_code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!group)
    return (
      <main className="p-8 text-center text-zinc-500">
        {error ? <p className={errorCls} role="alert">{error}</p> : 'Loading…'}
      </main>
    )

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Header title={group.name} back="/" />

      <div className="mb-4 flex gap-2">
        <Link to={`/group/${id}/expense/new`} className={btn}>+ Add expense</Link>
        <button className={btnGhost} onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy invite link'}</button>
      </div>

      <section className={card}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Balances</h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {balances.map(b => (
            <li key={b.user_id} className="flex justify-between py-2 text-sm">
              <span>{name(b.user_id)}</span>
              <span className={b.net > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : b.net < 0 ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-400'}>
                {b.net > 0 ? `is owed ₹${b.net}` : b.net < 0 ? `owes ₹${-b.net}` : 'settled up'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {debts.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Settle up</h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {debts.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{name(d.from_user)} → {name(d.to_user)}: <strong>₹{d.amount}</strong></span>
                {(d.from_user === userId || d.to_user === userId) && (
                  <button className={btnGhost} onClick={() => recordSettlement(d)}>Record paid</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${card} mt-4`}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="py-2 text-sm text-zinc-500">No expenses yet — add the first one.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {expenses.map(e => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{e.description ?? 'Expense'}</span>
                  <span className="font-semibold">₹{e.amount}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  paid by {name(e.paid_by)} · {new Date(e.occurred_at).toLocaleDateString()}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {e.expense_splits.map(s => `${name(s.user_id)} ₹${toRupees(Math.round(s.share_amount * 100))}`).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settlements.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Settlements</h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {settlements.map(s => (
              <li key={s.id} className="py-2 text-sm">
                {name(s.from_user)} paid {name(s.to_user)} <strong>₹{s.amount}</strong>{' '}
                <span className="text-xs text-zinc-400">({s.status})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className={`${errorCls} mt-3`} role="alert">{error}</p>}
    </main>
  )
}
