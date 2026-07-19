import { useEffect, useState } from 'react'
import { useUserId } from '../auth'
import { supabase } from '../supabase'
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

      <div className={`${card} mt-4`}>
        <button className={`${btnGhost} w-full text-red-600 dark:text-red-400`} onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}
