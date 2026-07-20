import { describe, expect, it } from 'vitest'
import { extractVpa, normalizeCounterparty, route, type RouteContext, type RouteTxn } from './index'

const debit = (counterparty_raw: string | null): RouteTxn => ({ direction: 'debit', amount: 10000, counterparty_raw })
const credit = (counterparty_raw: string | null): RouteTxn => ({ direction: 'credit', amount: 10000, counterparty_raw })

const ctx: RouteContext = {
  vpaMembers: {
    'rahul@okhdfc': { member_user_id: 'u-rahul', shared_open_group_ids: ['g1'] },
    'priya@oksbi': { member_user_id: 'u-priya', shared_open_group_ids: ['g1', 'g2'] },
    'amit@okicici': { member_user_id: 'u-amit', shared_open_group_ids: [] },
  },
  rules: [
    { match_key: 'swiggy', action: 'personal', category: 'food', group_id: null },
    { match_key: 'goa villa rentals', action: 'group', category: null, group_id: 'g9' },
    { match_key: 'amit stores', action: 'ignore', category: null, group_id: null },
  ],
}

describe('extractVpa', () => {
  it('finds a VPA embedded in a sentence', () => {
    expect(extractVpa('Paid to VPA rahul@okhdfc via UPI')).toBe('rahul@okhdfc')
  })
  it('lowercases uppercase input', () => {
    expect(extractVpa('RAHUL.99@OKHDFC')).toBe('rahul.99@okhdfc')
  })
  it('null for a string with no VPA', () => {
    expect(extractVpa('SWIGGY BANGALORE')).toBeNull()
  })
  it('null for null', () => {
    expect(extractVpa(null)).toBeNull()
  })
})

describe('normalizeCounterparty', () => {
  it('lowercases, trims, collapses whitespace', () => {
    expect(normalizeCounterparty('  Goa   Villa\tRentals ')).toBe('goa villa rentals')
  })
  it('strips trailing ref/txn/numeric-id tokens', () => {
    expect(normalizeCounterparty('Swiggy Ref 12345')).toBe('swiggy')
    expect(normalizeCounterparty('Swiggy txn 998877')).toBe('swiggy')
    expect(normalizeCounterparty('Swiggy 12345')).toBe('swiggy')
  })
  it('does not strip non-trailing or lone tokens', () => {
    expect(normalizeCounterparty('7 eleven')).toBe('7 eleven')
    expect(normalizeCounterparty('12345')).toBe('12345')
  })
  it('empty string for null', () => {
    expect(normalizeCounterparty(null)).toBe('')
  })
})

describe('route: debit member paths', () => {
  it('member with exactly 1 shared open group -> group_pending_split', () => {
    expect(route(debit('rahul@okhdfc'), ctx)).toEqual({ kind: 'group_pending_split', group_id: 'g1' })
  })
  it('member with 2+ groups -> review choose_group', () => {
    expect(route(debit('priya@oksbi'), ctx)).toEqual({
      kind: 'review',
      reviewKind: 'choose_group',
      member_user_id: 'u-priya',
      group_ids: ['g1', 'g2'],
    })
  })
  it('member with 0 shared open groups falls through to rules', () => {
    const c: RouteContext = { ...ctx, rules: [{ match_key: 'amit@okicici', action: 'personal', category: 'rent', group_id: null }] }
    expect(route(debit('amit@okicici'), c)).toEqual({ kind: 'personal', category: 'rent' })
  })
})

describe('route: debit rule paths', () => {
  it('rule personal -> personal with category', () => {
    expect(route(debit('SWIGGY Ref 12345'), ctx)).toEqual({ kind: 'personal', category: 'food' })
  })
  it('rule group -> group_pending_split with rule group_id', () => {
    expect(route(debit('Goa Villa Rentals'), ctx)).toEqual({ kind: 'group_pending_split', group_id: 'g9' })
  })
  it('rule ignore -> ignore', () => {
    expect(route(debit('Amit Stores'), ctx)).toEqual({ kind: 'ignore' })
  })
  it('no rule match -> review unrouted_txn', () => {
    expect(route(debit('RANDOM MERCHANT'), ctx)).toEqual({ kind: 'review', reviewKind: 'unrouted_txn' })
    expect(route(debit(null), ctx)).toEqual({ kind: 'review', reviewKind: 'unrouted_txn' })
  })
})

describe('route: credit paths', () => {
  it('member with shared open groups -> review member_credit', () => {
    expect(route(credit('priya@oksbi'), ctx)).toEqual({
      kind: 'review',
      reviewKind: 'member_credit',
      member_user_id: 'u-priya',
      group_ids: ['g1', 'g2'],
    })
  })
  it('unknown counterparty -> ignore', () => {
    expect(route(credit('stranger@okaxis'), ctx)).toEqual({ kind: 'ignore' })
    expect(route(credit(null), ctx)).toEqual({ kind: 'ignore' })
  })
  it('member with 0 shared open groups -> ignore', () => {
    expect(route(credit('amit@okicici'), ctx)).toEqual({ kind: 'ignore' })
  })
  it('rules do NOT apply to credits', () => {
    expect(route(credit('Swiggy Ref 12345'), ctx)).toEqual({ kind: 'ignore' })
  })
})
