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
  memberDebts: [],
}

const debt = (member_user_id: string, group_id: string, i_owe: number[], owed_to_me: number[] = []) => ({
  member_user_id,
  group_id,
  i_owe_amounts: i_owe,
  owed_to_me_amounts: owed_to_me,
})

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

describe('route: settlement matcher', () => {
  it('debit exact match in one group -> settlement_out', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-rahul', 'g1', [10000])] }
    expect(route(debit('rahul@okhdfc'), c)).toEqual({ kind: 'settlement_out', group_id: 'g1', member_user_id: 'u-rahul' })
  })
  it('debit exact match in two groups -> review choose_group with both ids', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-priya', 'g1', [10000]), debt('u-priya', 'g2', [10000])] }
    expect(route(debit('priya@oksbi'), c)).toEqual({
      kind: 'review',
      reviewKind: 'choose_group',
      member_user_id: 'u-priya',
      group_ids: ['g1', 'g2'],
    })
  })
  it('debit 1 paisa off -> falls to group_pending_split (0% tolerance)', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-rahul', 'g1', [10001])] }
    expect(route(debit('rahul@okhdfc'), c)).toEqual({ kind: 'group_pending_split', group_id: 'g1' })
  })
  it('credit exact match in one group -> settlement_in', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-rahul', 'g1', [], [10000])] }
    expect(route(credit('rahul@okhdfc'), c)).toEqual({ kind: 'settlement_in', group_id: 'g1', member_user_id: 'u-rahul' })
  })
  it('credit exact match in two groups -> review member_credit with matching ids', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-priya', 'g1', [], [10000]), debt('u-priya', 'g2', [], [10000])] }
    expect(route(credit('priya@oksbi'), c)).toEqual({
      kind: 'review',
      reviewKind: 'member_credit',
      member_user_id: 'u-priya',
      group_ids: ['g1', 'g2'],
    })
  })
  it('credit 1 paisa off -> plain member_credit review (0% tolerance)', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-rahul', 'g1', [], [10001])] }
    expect(route(credit('rahul@okhdfc'), c)).toEqual({
      kind: 'review',
      reviewKind: 'member_credit',
      member_user_id: 'u-rahul',
      group_ids: ['g1'],
    })
  })
  it('memberDebts for a different member leave routing unaffected', () => {
    const c: RouteContext = { ...ctx, memberDebts: [debt('u-priya', 'g1', [10000], [10000])] }
    expect(route(debit('rahul@okhdfc'), c)).toEqual({ kind: 'group_pending_split', group_id: 'g1' })
    expect(route(credit('rahul@okhdfc'), c)).toEqual({
      kind: 'review',
      reviewKind: 'member_credit',
      member_user_id: 'u-rahul',
      group_ids: ['g1'],
    })
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
