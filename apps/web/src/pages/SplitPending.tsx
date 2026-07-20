import { computeSplits, toPaise, toRupees, type SplitMode } from '@splitstream/shared'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUserId } from '../auth'
import { supabase } from '../supabase'
import { btn, card, errorCls, Header, input, labelCls } from '../ui'

type Member = { user_id: string; profiles: { display_name: string | null } | null }
const MODES: SplitMode[] = ['equal', 'exact', 'percent', 'shares']

export function SplitPending() {
  const { id, eid } = useParams()
  const userId = useUserId()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [expense, setExpense] = useState<{ amount: number; description: string | null } | null>(null)
  const [mode, setMode] = useState<SplitMode>('equal')
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('group_members').select('user_id, profiles(display_name)').eq('group_id', id)
      .then(({ data }) => {
        const ms = (data as unknown as Member[]) ?? []
        setMembers(ms)
        setIncluded(new Set(ms.map(m => m.user_id)))
      })
    supabase.from('expenses').select('amount, description').eq('id', eid).single()
      .then(({ data }) => setExpense(data))
  }, [id, eid])

  const name = (m: Member) => (m.user_id === userId ? 'You' : m.profiles?.display_name ?? '…')
  const participants = members.filter(m => included.has(m.user_id)).map(m => m.user_id)
  const amount = expense?.amount ?? 0

  // values are rupees for 'exact', raw numbers for percent/shares
  const splits = useMemo(() => {
    try {
      const totalPaise = toPaise(amount)
      const nums = Object.fromEntries(
        participants.map(u => [u, mode === 'exact' ? toPaise(values[u] || '0') : Number(values[u] || '0')]),
      )
      return computeSplits(totalPaise, mode, participants, nums)
    } catch {
      return null
    }
  }, [amount, mode, values, members, included])

  const toggle = (uid: string) => {
    const next = new Set(included)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    setIncluded(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!splits) return setError('Splits don’t add up — check the numbers.')
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('confirm_expense_split', {
      eid,
      new_splits: participants.map(u => ({ user_id: u, share_amount: toRupees(splits[u]) })),
    })
    setBusy(false)
    if (error) setError(error.message)
    else navigate(`/group/${id}`)
  }

  if (!expense) return <p className="p-8 text-center text-zinc-500">Loading…</p>

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <Header title={`Split ₹${expense.amount}`} back={`/group/${id}`} />
      {expense.description && <p className="mb-4 text-sm text-zinc-500">{expense.description}</p>}

      <form onSubmit={submit} className="space-y-4">
        <div className={card}>
          <p className={labelCls}>Split</p>
          <div className="mt-2 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist">
            {MODES.map(m => (
              <button
                type="button" key={m} role="tab" aria-selected={m === mode}
                className={`flex-1 rounded-lg py-1.5 text-sm capitalize transition ${
                  m === mode ? 'bg-white font-medium shadow-sm dark:bg-zinc-700' : 'text-zinc-500'
                }`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {members.map(m => (
              <li key={m.user_id} className="flex items-center gap-3 py-2">
                <label className="flex grow items-center gap-2 text-sm">
                  <input
                    type="checkbox" className="size-4 accent-indigo-600"
                    checked={included.has(m.user_id)} onChange={() => toggle(m.user_id)}
                  />
                  {name(m)}
                </label>
                {mode !== 'equal' && included.has(m.user_id) && (
                  <input
                    className={`${input} w-20 text-right`} inputMode="decimal"
                    aria-label={`${name(m)} ${mode === 'exact' ? 'amount' : mode}`}
                    placeholder={mode === 'exact' ? '₹' : mode === 'percent' ? '%' : '×'}
                    value={values[m.user_id] ?? ''}
                    onChange={e => setValues({ ...values, [m.user_id]: e.target.value })}
                  />
                )}
                {splits && included.has(m.user_id) && (
                  <span className="w-20 text-right text-sm tabular-nums text-zinc-500">₹{toRupees(splits[m.user_id])}</span>
                )}
              </li>
            ))}
          </ul>

          {splits && mode === 'equal' && participants.length > 0 && (
            <p className="mt-2 text-center text-sm text-zinc-500">
              ₹{amount} ÷ {participants.length} = ₹{toRupees(splits[participants[0]])}
            </p>
          )}
        </div>

        <button className={`${btn} w-full`} disabled={busy || !splits}>
          {busy ? 'Saving…' : 'Confirm split'}
        </button>
        {error && <p className={errorCls} role="alert">{error}</p>}
      </form>
    </main>
  )
}
