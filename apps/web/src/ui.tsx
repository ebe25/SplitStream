import { useState } from 'react'
import { Link } from 'react-router-dom'

export const card =
  'rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
export const input =
  'w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
export const btn =
  `rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 ${focusRing}`
export const btnGhost =
  `rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 active:scale-[.98] dark:border-zinc-700 dark:hover:bg-zinc-800 ${focusRing}`
export const labelCls = 'block text-sm font-medium text-zinc-600 dark:text-zinc-400'
export const errorCls = 'text-sm text-red-600 dark:text-red-400'

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#09090b' : '#fafafa')
    setDark(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-full p-2 text-lg transition hover:bg-zinc-200 dark:hover:bg-zinc-800"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export function Header({ title, back }: { title: string; back?: string }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} aria-label="Back" className="rounded-full p-2 transition hover:bg-zinc-200 dark:hover:bg-zinc-800">
          ←
        </Link>
      )}
      <h1 className="grow text-xl font-semibold tracking-tight">{title}</h1>
      <ThemeToggle />
    </header>
  )
}
