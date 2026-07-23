import Lottie from 'lottie-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

// ponytail: hand-authored Lottie (spinning pine arc) — swap for a designer .json anytime
const spinner = {
  v: '5.7.4', fr: 60, ip: 0, op: 60, w: 48, h: 48, nm: 'spinner', ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'arc', sr: 1, ip: 0, op: 60, st: 0,
    ks: {
      o: { a: 0, k: 100 }, p: { a: 0, k: [24, 24, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
      r: { a: 1, k: [{ t: 0, s: [0], i: { x: [0.5], y: [0.5] }, o: { x: [0.5], y: [0.5] } }, { t: 60, s: [360] }] },
    },
    shapes: [{
      ty: 'gr', nm: 'g', it: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [36, 36] } },
        { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 0, k: 35 }, o: { a: 0, k: 0 }, m: 1 },
        { ty: 'st', c: { a: 0, k: [0.055, 0.42, 0.353, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 2, lj: 2 },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ],
    }],
  }],
}

export function Loading() {
  return (
    <div className="flex justify-center p-8" role="status" aria-label="Loading">
      <Lottie animationData={spinner} loop style={{ width: 48, height: 48 }} />
    </div>
  )
}

export function PageFade({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}

const CONFETTI = ['#0f6b5a', '#e5c36a', '#45c3a2', '#f9eed2']

/** Fires a burst each time `burst` increments past 0. */
export function Confetti({ burst }: { burst: number }) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (!burst) return
    setActive(burst)
    const t = setTimeout(() => setActive(0), 1500)
    return () => clearTimeout(t)
  }, [burst])
  if (!active) return null
  const n = 28
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * 2 * Math.PI
        const dist = 110 + (i % 5) * 45
        return (
          <motion.span
            key={`${active}-${i}`}
            className="absolute left-1/2 top-1/3 h-2 w-2 rounded-sm"
            style={{ background: CONFETTI[i % CONFETTI.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 150, opacity: 0, rotate: 200 + i * 37, scale: 0.5 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}
