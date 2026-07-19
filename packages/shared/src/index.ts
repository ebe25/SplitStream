export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares'

/**
 * Split totalPaise across users so the shares sum EXACTLY to the total.
 * All money is integer paise — no floats near the ledger.
 * - equal:   values ignored
 * - exact:   values = paise per user, must sum to total
 * - percent: values = percentages, must sum to 100
 * - shares:  values = weights, any positive numbers
 * Remainders go to the users with the largest fractional part (deterministic:
 * ties broken by user order).
 */
export function computeSplits(
  totalPaise: number,
  mode: SplitMode,
  users: string[],
  values: Record<string, number> = {},
): Record<string, number> {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) throw new Error('total must be positive integer paise')
  if (users.length === 0) throw new Error('no participants')

  if (mode === 'exact') {
    const sum = users.reduce((s, u) => s + (values[u] ?? 0), 0)
    if (sum !== totalPaise) throw new Error(`exact amounts sum to ${sum}, expected ${totalPaise}`)
    return Object.fromEntries(users.map(u => [u, values[u] ?? 0]))
  }

  const weights = users.map(u => (mode === 'equal' ? 1 : values[u] ?? 0))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0 || weights.some(w => w < 0)) throw new Error('weights must be positive')
  if (mode === 'percent' && totalWeight !== 100) throw new Error(`percentages sum to ${totalWeight}, expected 100`)

  const raw = weights.map(w => (totalPaise * w) / totalWeight)
  const floors = raw.map(Math.floor)
  let remainder = totalPaise - floors.reduce((s, f) => s + f, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (remainder <= 0) break
    floors[i] += 1
    remainder -= 1
  }
  return Object.fromEntries(users.map((u, i) => [u, floors[i]]))
}

export const toPaise = (rupees: string | number): number => Math.round(Number(rupees) * 100)
export const toRupees = (paise: number): string => (paise / 100).toFixed(2)
