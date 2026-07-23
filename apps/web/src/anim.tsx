import Lottie from 'lottie-react'
import { motion, useSpring, type MotionProps } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

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

function useMascotSprings() {
  const ref = useRef<HTMLDivElement>(null)
  const px = useSpring(0, { stiffness: 350, damping: 18 }) // pupil travel
  const py = useSpring(0, { stiffness: 350, damping: 18 })
  const rx = useSpring(0, { stiffness: 140, damping: 14 }) // tilt
  const ry = useSpring(0, { stiffness: 140, damping: 14 })

  useEffect(() => {
    const look = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const reach = (Math.min(d, 140) / 140) * 4
      px.set((dx / d) * reach)
      py.set((dy / d) * reach)
      ry.set(Math.max(-12, Math.min(12, dx / 16)))
      rx.set(Math.max(-12, Math.min(12, -dy / 16)))
    }
    window.addEventListener('pointermove', look)
    window.addEventListener('pointerdown', look)
    return () => {
      window.removeEventListener('pointermove', look)
      window.removeEventListener('pointerdown', look)
    }
  }, [px, py, rx, ry])
  return { ref, px, py, rx, ry }
}

const popFloat: MotionProps = {
  initial: { scale: 0, rotate: -14, y: 0 },
  animate: { scale: 1, rotate: 0, y: [0, -6, 0] },
  transition: {
    scale: { type: 'spring', stiffness: 260, damping: 13 },
    rotate: { type: 'spring', stiffness: 260, damping: 13 },
    y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.2 },
  },
}

/** Auth mascot: two friends + a ₹ coin that splits toward each on hover/tap; eyes track pointer. */
export function Mascot() {
  const { ref, px, py, rx, ry } = useMascotSprings()

  const eye = (
    <span className="mascot-eye flex size-3 items-center justify-center rounded-full bg-white">
      <motion.span style={{ x: px, y: py }} className="size-1.5 rounded-full bg-pine-deep" />
    </span>
  )

  const friend = (lean: number) => (
    <motion.div
      variants={{ idle: { x: 0, rotate: 0 }, split: { x: lean * 3, rotate: lean * 8 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className="flex size-12 flex-col items-center justify-center gap-1 rounded-full bg-pine shadow-card"
    >
      <span className="flex gap-1">{eye}{eye}</span>
      <span className="h-1 w-3 rounded-b-full border-b-2 border-white/90" />
    </motion.div>
  )

  const chip = (dir: number) => (
    <motion.span
      variants={{ idle: { opacity: 0, x: 0, scale: 0.4 }, split: { opacity: 1, x: dir * 30, scale: 1 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 16 }}
      className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 flex size-3 items-center justify-center rounded-full bg-[#e5c36a]"
    />
  )

  return (
    <motion.div aria-hidden className="mx-auto mb-4 w-fit" style={{ perspective: 400 }} {...popFloat}>
      <motion.div
        ref={ref}
        style={{ rotateX: rx, rotateY: ry }}
        initial="idle"
        animate="idle"
        whileHover="split"
        whileTap="split"
        className="relative flex items-center gap-2"
      >
        {friend(1)}
        <span className="mascot-stream h-1 w-4 rounded-full" />
        <motion.div
          variants={{ idle: { scale: 1, rotate: 0 }, split: { scale: 1.2, rotate: 12 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="flex size-10 items-center justify-center rounded-full border-2 border-[#c9a53f] bg-[#e5c36a] font-display text-lg font-bold text-pine-deep shadow-card"
        >
          ₹
        </motion.div>
        <span className="mascot-stream h-1 w-4 rounded-full" />
        {friend(-1)}
        {chip(-1)}
        {chip(1)}
      </motion.div>
    </motion.div>
  )
}

/** Alternate concept kept for comparison: one coin, two eyed halves that crack apart. */
export function MascotSplitCoin() {
  const { ref, px, py, rx, ry } = useMascotSprings()

  const eye = (
    <span className="mascot-eye flex size-4 items-center justify-center rounded-full bg-white">
      <motion.span style={{ x: px, y: py }} className="size-2 rounded-full bg-pine-deep" />
    </span>
  )

  // one ₹ coin, two halves: crack apart on hover/tap, spring back — the split
  const half = {
    idle: { x: 0, rotate: 0 },
    split: (side: number) => ({ x: side * 6, rotate: side * 5 }),
  }

  return (
    <motion.div
      aria-hidden
      className="mx-auto mb-4 w-fit"
      style={{ perspective: 400 }}
      initial={{ scale: 0, rotate: -14, y: 0 }}
      animate={{ scale: 1, rotate: 0, y: [0, -6, 0] }}
      transition={{
        scale: { type: 'spring', stiffness: 260, damping: 13 },
        rotate: { type: 'spring', stiffness: 260, damping: 13 },
        y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.2 },
      }}
    >
      <motion.div
        ref={ref}
        style={{ rotateX: rx, rotateY: ry, boxShadow: '0 10px 32px rgba(15,107,90,0.4)' }}
        initial="idle"
        animate="idle"
        whileHover="split"
        whileTap="split"
        variants={{ idle: { scale: 1 }, split: { scale: 0.95 } }}
        className="flex size-20 overflow-hidden rounded-full border-4 border-[#e5c36a] bg-pine"
      >
        <motion.div custom={-1} variants={half} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="flex w-1/2 flex-col items-center justify-center gap-1 border-r border-dashed border-white/40">
          {eye}
          <span className="font-display text-sm font-bold leading-none text-white">₹</span>
        </motion.div>
        <motion.div custom={1} variants={half} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="flex w-1/2 flex-col items-center justify-center gap-1">
          {eye}
          <span className="font-display text-sm font-bold leading-none text-white">₹</span>
        </motion.div>
      </motion.div>
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
