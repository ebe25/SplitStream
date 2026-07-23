import { useState, useSyncExternalStore } from 'react'
import { btn, card } from './ui'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* Module-level: beforeinstallprompt often fires before React mounts. */
let deferred: BeforeInstallPromptEvent | null = null
let installedEvent = false
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach(l => l()) }
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => { deferred = null; installedEvent = true; notify() })

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function useInstall() {
  useSyncExternalStore(subscribe, () => version)
  const standalone = isStandalone()
  return {
    canInstall: !!deferred && !standalone,
    installed: standalone || installedEvent,
    isIos: /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone,
    promptInstall: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      notify()
    },
  }
}

export function InstallBanner() {
  const { canInstall, installed, isIos, promptInstall } = useInstall()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('install-dismissed') === '1')

  if (installed || dismissed || (!canInstall && !isIos)) return null

  return (
    <div className={`${card} fixed inset-x-0 bottom-14 mx-4 flex items-center gap-3 p-3`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine text-lg font-semibold text-white">₹</div>
      <p className="min-w-0 grow text-sm">
        <span className="font-medium">Install SplitStream</span>
        <span className="block text-xs text-muted">
          {isIos ? 'Tap Share → Add to Home Screen' : 'Works offline, gets push notifications'}
        </span>
      </p>
      {canInstall && <button className={btn} onClick={promptInstall}>Install</button>}
      <button
        aria-label="Dismiss install banner"
        className="rounded-full p-2 text-muted transition hover:bg-soft hover:text-ink"
        onClick={() => { localStorage.setItem('install-dismissed', '1'); setDismissed(true) }}
      >
        ✕
      </button>
    </div>
  )
}
