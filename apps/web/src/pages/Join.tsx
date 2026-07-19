import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { errorCls } from '../ui'

export function Join() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('join_group', { code }).then(({ data, error }) => {
      if (error) setError(error.message)
      else navigate(`/group/${data}`, { replace: true })
    })
  }, [code])

  return (
    <main className="p-8 text-center text-zinc-500">
      {error ? <p className={errorCls} role="alert">{error}</p> : 'Joining…'}
    </main>
  )
}
