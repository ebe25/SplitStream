import { describe, expect, it } from 'vitest'
import { computeSplits, toPaise, toRupees } from './index'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('computeSplits', () => {
  it('equal split, clean division', () => {
    expect(computeSplits(180000, 'equal', ['a', 'b', 'c', 'd'])).toEqual({ a: 45000, b: 45000, c: 45000, d: 45000 })
  })

  it('equal split distributes remainder paise, sums exactly', () => {
    const r = computeSplits(10000, 'equal', ['a', 'b', 'c'])
    expect(sum(r)).toBe(10000)
    expect(Object.values(r).sort()).toEqual([3333, 3333, 3334])
  })

  it('exact must sum to total', () => {
    expect(computeSplits(1000, 'exact', ['a', 'b'], { a: 300, b: 700 })).toEqual({ a: 300, b: 700 })
    expect(() => computeSplits(1000, 'exact', ['a', 'b'], { a: 300, b: 600 })).toThrow()
  })

  it('percent must sum to 100, output sums exactly', () => {
    const r = computeSplits(99999, 'percent', ['a', 'b', 'c'], { a: 50, b: 25, c: 25 })
    expect(sum(r)).toBe(99999)
    expect(() => computeSplits(1000, 'percent', ['a', 'b'], { a: 50, b: 40 })).toThrow()
  })

  it('shares are weight-proportional and sum exactly', () => {
    const r = computeSplits(700, 'shares', ['a', 'b'], { a: 2, b: 5 })
    expect(r).toEqual({ a: 200, b: 500 })
    expect(sum(computeSplits(701, 'shares', ['a', 'b'], { a: 2, b: 5 }))).toBe(701)
  })

  it('rejects garbage', () => {
    expect(() => computeSplits(0, 'equal', ['a'])).toThrow()
    expect(() => computeSplits(100.5, 'equal', ['a'])).toThrow()
    expect(() => computeSplits(100, 'equal', [])).toThrow()
    expect(() => computeSplits(100, 'shares', ['a', 'b'], { a: -1, b: 2 })).toThrow()
  })

  it('paise round-trip', () => {
    expect(toPaise('1800')).toBe(180000)
    expect(toPaise('0.1')).toBe(10)
    expect(toRupees(45050)).toBe('450.50')
  })
})
