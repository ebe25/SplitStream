import { useState } from 'react'
import { Link } from 'react-router-dom'

export const card = 'rounded-2xl border border-line bg-surface p-4 shadow-card'
export const input =
  'w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-faint focus:border-pine focus:ring-2 focus:ring-pine/25'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
export const btn =
  `rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white transition hover:bg-pine-deep active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 ${focusRing}`
export const btnGhost =
  `rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-pine/40 hover:bg-pine-soft/60 active:scale-[.98] ${focusRing}`
export const labelCls = 'block text-sm font-medium text-muted'
export const errorCls = 'text-sm text-neg'
/* section heading inside cards */
export const sectionCls = 'mb-2 text-xs font-semibold uppercase tracking-wider text-faint'

/* Money is the hero: Indian digit grouping, tabular figures, quiet ₹ glyph,
   colored by direction where it matters. */
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatINR = (n: number | string) => {
  const v = Number(n)
  return Number.isInteger(v) ? inr0.format(v) : inr2.format(v)
}

export function Money({ amount, tone, className = '' }: {
  amount: number | string
  tone?: 'pos' | 'neg'
  className?: string
}) {
  const toneCls = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''
  return (
    <span className={`font-semibold tabular-nums ${toneCls} ${className}`}>
      <span className="font-normal opacity-70">₹</span>
      {formatINR(amount)}
    </span>
  )
}

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#0c1411' : '#eff3ef')
    setDark(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-full p-2 text-lg transition hover:bg-soft"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export function Header({ title, back }: { title: string; back?: string }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} aria-label="Back" className="rounded-full p-2 text-muted transition hover:bg-soft hover:text-ink">
          ←
        </Link>
      )}
      <h1 className="grow text-2xl font-semibold tracking-tight">{title}</h1>
      <ThemeToggle />
    </header>
  )
}
