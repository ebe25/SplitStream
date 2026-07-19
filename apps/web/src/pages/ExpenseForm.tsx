import { computeSplits, toPaise, toRupees, type SplitMode } from '@splitstream/shared'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUserId } from '../auth'
import { supabase } from '../supabase'
import { btn, card, errorCls, Header, input, labelCls } from '../ui'

type Member = { user_id: string; profiles: { display_name: string | null } | null }
const MODES: SplitMode[] = ['equal', 'exact', 'percent', 'shares']

export function ExpenseForm() {
  const { id } = useParams()
  const userId = useUserId()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
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
  }, [id])

  useEffect(() => { if (userId && !paidBy) setPaidBy(userId) }, [userId, paidBy])

  const name = (m: Member) => (m.user_id === userId ? 'You' : m.profiles?.display_name ?? '…')
  const participants = members.filter(m => included.has(m.user_id)).map(m => m.user_id)

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
    const { error } = await supabase.rpc('create_group_expense', {
      gid: id,
      payer: paidBy,
      amt: Number(amount),
      descr: description || null,
      splits: participants.map(u => ({ user_id: u, share_amount: toRupees(splits[u]) })),
    })
    setBusy(false)
    if (error) setError(error.message)
    else navigate(`/group/${id}`)
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <Header title="Add expense" back={`/group/${id}`} />

      <form onSubmit={submit} className="space-y-4">
        <div className={card}>
          <div className="space-y-3">
            <div>
              <label htmlFor="desc" className={labelCls}>Description</label>
              <input id="desc" className={`${input} mt-1`} placeholder="Groceries" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <label htmlFor="amt" className={labelCls}>Amount (₹)</label>
              <input id="amt" required inputMode="decimal" placeholder="0.00" className={`${input} mt-1`} value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label htmlFor="payer" className={labelCls}>Paid by</label>
              <select id="payer" className={`${input} mt-1`} value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{name(m)}</option>)}
              </select>
            </div>
          </div>
        </div>

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
          {busy ? 'Saving…' : 'Save expense'}
        </button>
        {error && <p className={errorCls} role="alert">{error}</p>}
      </form>
    </main>
  )
}
