import { useEffect, useState } from 'react'
import { useUserId } from '../auth'
import { supabase } from '../supabase'
import { btn, card, errorCls, Header, input } from '../ui'

type PersonalExpense = { id: string; amount: number; category: string | null; description: string | null; occurred_at: string }

export function Personal() {
  const userId = useUserId()
  const [items, setItems] = useState<PersonalExpense[]>([])
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const load = () =>
    supabase.from('personal_expenses').select('*').order('occurred_at', { ascending: false }).limit(100)
      .then(({ data }) => setItems(data ?? []))

  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('personal_expenses').insert({
      user_id: userId, amount: Number(amount), category: category || null, description: description || null,
    })
    if (error) return setError(error.message)
    setAmount(''); setCategory(''); setDescription('')
    load()
  }

  const total = items.reduce((s, i) => s + Number(i.amount), 0)

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <Header title="Personal" />
      <p className="mb-3 text-sm text-zinc-500">Total (last {items.length}): <strong className="text-zinc-900 dark:text-zinc-100">₹{total.toFixed(2)}</strong></p>

      <form onSubmit={add} className={`${card} flex flex-wrap gap-2`}>
        <input required inputMode="decimal" placeholder="₹" aria-label="Amount" className={`${input} w-24 flex-none`} value={amount} onChange={e => setAmount(e.target.value)} />
        <input placeholder="Category" aria-label="Category" className={`${input} w-28 flex-none`} value={category} onChange={e => setCategory(e.target.value)} />
        <input placeholder="Description" aria-label="Description" className={`${input} min-w-32 flex-1`} value={description} onChange={e => setDescription(e.target.value)} />
        <button className={btn}>Add</button>
      </form>
      {error && <p className={`${errorCls} mt-2`} role="alert">{error}</p>}

      <ul className={`${card} mt-4 divide-y divide-zinc-100 dark:divide-zinc-800`}>
        {items.map(i => (
          <li key={i.id} className="flex justify-between py-2 text-sm">
            <span>
              {i.description ?? i.category ?? 'Expense'}
              {i.category && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">{i.category}</span>}
            </span>
            <span className="text-right">
              <strong>₹{i.amount}</strong>
              <div className="text-xs text-zinc-400">{new Date(i.occurred_at).toLocaleDateString()}</div>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-zinc-500">Nothing yet — log your first expense above. From Phase 1 these arrive automatically from bank SMS.</li>}
      </ul>
    </main>
  )
}
