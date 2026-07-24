import { useEffect, useState } from 'react'
import { Loading } from './anim'
import { useUserId } from './auth'
import { enablePush, pushEnabled } from './push'
import { btn, btnGhost, card } from './ui'

const SKIP_KEY = 'push-setup-skipped'

// Post-login gate: offer push once, never block — unsupported, denied, or
// skipped all fall through to the app.
export function PushGate({ children }: { children: React.ReactNode }) {
  const userId = useUserId()
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    if (!supported || Notification.permission === 'denied' || localStorage.getItem(SKIP_KEY) === '1') {
      setShow(false)
      return
    }
    pushEnabled().then(enabled => setShow(!enabled))
  }, [])

  if (show === null) return <Loading />
  if (!show) return <>{children}</>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <div className={`${card} space-y-3`}>
        <h2 className="font-display text-xl font-bold tracking-tight">Turn on notifications</h2>
        <p className="text-sm text-muted">
          Get a ping when a payment needs splitting or a friend settles up —
          SplitStream works quietly in the background.
        </p>
        <button
          className={`${btn} w-full`}
          onClick={async () => {
            try { await enablePush(userId) } catch (e) { console.error(e) }
            setShow(false) // never trap the user here — Settings has the retry
          }}
        >
          Enable notifications
        </button>
        <button
          className={`${btnGhost} w-full`}
          onClick={() => { localStorage.setItem(SKIP_KEY, '1'); setShow(false) }}
        >
          Not now
        </button>
      </div>
    </main>
  )
}
