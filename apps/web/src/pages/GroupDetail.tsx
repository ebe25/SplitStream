import { toRupees } from '@splitstream/shared'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Confetti, Loading } from '../anim'
import { useUserId } from '../auth'
import { supabase, type Balance, type Debt, type Group } from '../supabase'
import { btn, btnGhost, card, errorCls, Header, Money, sectionCls } from '../ui'

type Member = { user_id: string; profiles: { display_name: string | null; upi_vpa: string | null } | null }
type Expense = {
  id: string; description: string | null; amount: number; paid_by: string; status: string
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
  const [burst, setBurst] = useState(0)
  const wasSettled = useRef<boolean | null>(null)

  const load = useCallback(async () => {
    const [g, m, e, s, b, d] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('user_id, profiles(display_name, upi_vpa)').eq('group_id', id),
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

  // ADR-0001: payer-side records start pending; recipient-side records are confirmed.
  const markPaid = async (debt: Debt) => {
    const { data: existing, error: selErr } = await supabase.from('settlements').select('id')
      .eq('group_id', id).eq('from_user', userId).eq('to_user', debt.to_user)
      .eq('amount', debt.amount).eq('status', 'pending').limit(1)
    if (selErr) return setError(selErr.message)
    if (!existing?.length) {
      const { error } = await supabase.from('settlements').insert({
        group_id: id, from_user: userId, to_user: debt.to_user, amount: debt.amount, status: 'pending',
      })
      if (error) return setError(error.message)
    }
    load()
  }

  const recordReceived = async (debt: Debt) => {
    const { error } = await supabase.from('settlements').insert({
      group_id: id, from_user: debt.from_user, to_user: userId, amount: debt.amount, status: 'confirmed',
    })
    if (error) setError(error.message)
    else { setBurst(b => b + 1); load() }
  }

  const confirmSettlement = async (sid: string) => {
    const { error } = await supabase.from('settlements').update({ status: 'confirmed' }).eq('id', sid)
    if (error) setError(error.message)
    else { setBurst(b => b + 1); load() }
  }

  const setStatus = async (status: string) => {
    const { error } = await supabase.from('groups').update({ status }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}/join/${group?.invite_code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const closed = group?.status === 'closed'
  const allSettled = balances.length > 0 && balances.every(b => b.net === 0)

  // celebrate only the transition into fully-settled, not landing on an already-settled group
  useEffect(() => {
    if (!balances.length) return
    if (wasSettled.current === false && allSettled) setBurst(b => b + 1)
    wasSettled.current = allSettled
  }, [allSettled, balances.length])

  if (!group)
    return (
      <main className="p-8 text-center text-muted">
        {error ? <p className={errorCls} role="alert">{error}</p> : <Loading />}
      </main>
    )

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Confetti burst={burst} />
      <Header title={group.name} back="/" />

      <section className={`${card} mb-4 flex items-center justify-between gap-2`}>
        <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-muted">
          {group.status}
        </span>
        {group.status === 'active' && (
          <button className={btnGhost} onClick={() => setStatus('settling')}>Start settling</button>
        )}
        {group.status === 'settling' && (
          <span className="flex gap-2">
            <button className={btnGhost} onClick={() => setStatus('active')}>Reopen</button>
            <button
              className={btn}
              disabled={!allSettled}
              onClick={() => confirm('Close this group permanently?') && setStatus('closed')}
            >
              Close group
            </button>
          </span>
        )}
        {closed && <span className="text-sm text-muted">This group is closed (read-only)</span>}
      </section>

      {!closed && (
        <div className="mb-4 flex gap-2">
          {group.status === 'active' && <Link to={`/group/${id}/expense/new`} className={btn}>+ Add expense</Link>}
          <button className={btnGhost} onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy invite link'}</button>
        </div>
      )}

      <section className={card}>
        <h2 className={sectionCls}>Balances</h2>
        <ul className="divide-y divide-line/60">
          {balances.map(b => (
            <li key={b.user_id} className="flex items-baseline justify-between py-2 text-sm">
              <span>{name(b.user_id)}</span>
              {b.net > 0 ? (
                <span className="text-pos">is owed <Money amount={b.net} tone="pos" className="text-base" /></span>
              ) : b.net < 0 ? (
                <span className="text-neg">owes <Money amount={-b.net} tone="neg" className="text-base" /></span>
              ) : (
                <span className="text-faint">settled up</span>
              )}
            </li>
          ))}
        </ul>
        <AnimatePresence>
          {allSettled && (
            <motion.p
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="mt-3 rounded-xl bg-pine-soft py-3 text-center font-medium text-accent"
            >
              All settled up 🎉
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      {debts.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className={sectionCls}>Settle up</h2>
          <ul className="divide-y divide-line/60">
            <AnimatePresence initial={false}>
            {debts.map(d => {
              const vpa = members.find(m => m.user_id === d.to_user)?.profiles?.upi_vpa
              return (
                <motion.li
                  key={`${d.from_user}-${d.to_user}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>{name(d.from_user)} → {name(d.to_user)}: <Money amount={d.amount} className="text-base" /></span>
                  {!closed && d.from_user === userId && (
                    <span className="flex items-center gap-2">
                      {vpa ? (
                        <motion.a
                          whileTap={{ scale: 0.94 }}
                          className={btn}
                          href={`upi://pay?pa=${vpa}&pn=${encodeURIComponent(name(d.to_user))}&am=${d.amount}&cu=INR&tn=${encodeURIComponent(group.name + ' settle')}`}
                        >
                          Pay via UPI
                        </motion.a>
                      ) : (
                        <span className="text-xs text-faint">no UPI id</span>
                      )}
                      <motion.button whileTap={{ scale: 0.94 }} className={btnGhost} onClick={() => markPaid(d)}>I paid ✓</motion.button>
                    </span>
                  )}
                  {!closed && d.to_user === userId && (
                    <motion.button whileTap={{ scale: 0.94 }} className={btnGhost} onClick={() => recordReceived(d)}>Record received</motion.button>
                  )}
                </motion.li>
              )
            })}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <section className={`${card} mt-4`}>
        <h2 className={sectionCls}>Expenses</h2>
        {expenses.length === 0 ? (
          <p className="py-2 text-sm text-muted">No expenses yet — add the first one.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {expenses.map(e => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="grow font-medium">{e.description ?? 'Expense'}</span>
                  {e.status === 'pending_split' && (
                    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn-ink">
                      pending split
                    </span>
                  )}
                  {e.status === 'pending_split' && e.paid_by === userId && (
                    <Link to={`/group/${id}/split/${e.id}`} className="text-xs font-medium text-accent hover:underline">
                      Split
                    </Link>
                  )}
                  <Money amount={e.amount} className="text-base" />
                </div>
                <div className="text-xs text-muted">
                  paid by {name(e.paid_by)} · {new Date(e.occurred_at).toLocaleDateString()}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-faint">
                  {e.expense_splits.map(s => `${name(s.user_id)} ₹${toRupees(Math.round(s.share_amount * 100))}`).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settlements.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className={sectionCls}>Settlements</h2>
          <ul className="divide-y divide-line/60">
            <AnimatePresence initial={false}>
            {settlements.map(s => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {name(s.from_user)} paid {name(s.to_user)} <Money amount={s.amount} />{' '}
                  <span className="text-xs text-faint">({s.status})</span>
                </span>
                {s.status === 'pending' && s.to_user === userId && !closed && (
                  <motion.button whileTap={{ scale: 0.94 }} className={btnGhost} onClick={() => confirmSettlement(s.id)}>Confirm</motion.button>
                )}
                {s.status === 'pending' && s.from_user === userId && (
                  <span className="text-xs text-faint">awaiting confirmation</span>
                )}
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {error && <p className={`${errorCls} mt-3`} role="alert">{error}</p>}
    </main>
  )
}
