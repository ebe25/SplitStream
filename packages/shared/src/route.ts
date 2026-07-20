export type RouteTxn = { direction: 'debit' | 'credit'; amount: number; counterparty_raw: string | null }
export type MemberMatch = { member_user_id: string; shared_open_group_ids: string[] }
export type Rule = { match_key: string; action: 'personal' | 'group' | 'ignore'; category: string | null; group_id: string | null }
export type RouteContext = {
  vpaMembers: Record<string, MemberMatch> // key: lowercase VPA -> member + shared open group ids
  rules: Rule[]
  memberDebts: Array<{
    member_user_id: string
    group_id: string
    i_owe_amounts: number[] // paise; amounts that, paid BY owner TO member, settle
    owed_to_me_amounts: number[] // paise; amounts that, received FROM member, settle
  }>
}
export type RouteAction =
  | { kind: 'personal'; category: string | null }
  | { kind: 'group_pending_split'; group_id: string }
  | { kind: 'ignore' }
  | { kind: 'review'; reviewKind: 'unrouted_txn' }
  | { kind: 'review'; reviewKind: 'choose_group'; member_user_id: string; group_ids: string[] }
  | { kind: 'review'; reviewKind: 'member_credit'; member_user_id: string; group_ids: string[] }
  | { kind: 'settlement_out'; group_id: string; member_user_id: string } // payer side -> pending settlement
  | { kind: 'settlement_in'; group_id: string; member_user_id: string } // recipient side -> confirm/create confirmed

// first `handle@provider` token in the string, lowercased
export function extractVpa(raw: string | null): string | null {
  const m = raw?.match(/[a-z0-9._-]+@[a-z]+/i)
  return m ? m[0].toLowerCase() : null
}

// lowercase, collapse whitespace, drop trailing "ref"/"txn"/numeric-id tokens
export function normalizeCounterparty(raw: string | null): string {
  return (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(?: (?:ref|txn|\d+))+$/, '')
}

export function route(txn: RouteTxn, ctx: RouteContext): RouteAction {
  const vpa = extractVpa(txn.counterparty_raw)
  const member = vpa ? ctx.vpaMembers[vpa] : undefined
  const groups = member?.shared_open_group_ids ?? []

  // settlement matcher: exact integer paise match, 0% tolerance (see CONTEXT.md)
  const settleGroups = member
    ? ctx.memberDebts
        .filter(
          d =>
            d.member_user_id === member.member_user_id &&
            (txn.direction === 'debit' ? d.i_owe_amounts : d.owed_to_me_amounts).includes(txn.amount),
        )
        .map(d => d.group_id)
    : []

  if (txn.direction === 'credit') {
    // rules never apply to credits
    if (member && settleGroups.length === 1)
      return { kind: 'settlement_in', group_id: settleGroups[0], member_user_id: member.member_user_id }
    if (member && settleGroups.length >= 2)
      return { kind: 'review', reviewKind: 'member_credit', member_user_id: member.member_user_id, group_ids: settleGroups }
    if (member && groups.length >= 1)
      return { kind: 'review', reviewKind: 'member_credit', member_user_id: member.member_user_id, group_ids: groups }
    return { kind: 'ignore' }
  }

  // debit
  if (member && settleGroups.length === 1)
    return { kind: 'settlement_out', group_id: settleGroups[0], member_user_id: member.member_user_id }
  if (member && settleGroups.length >= 2)
    return { kind: 'review', reviewKind: 'choose_group', member_user_id: member.member_user_id, group_ids: settleGroups }
  if (member && groups.length === 1) return { kind: 'group_pending_split', group_id: groups[0] }
  if (member && groups.length >= 2)
    return { kind: 'review', reviewKind: 'choose_group', member_user_id: member.member_user_id, group_ids: groups }

  // member with 0 shared open groups (or no member) falls through to rules
  const key = normalizeCounterparty(txn.counterparty_raw)
  const rule = ctx.rules.find(r => r.match_key === key)
  if (rule) {
    if (rule.action === 'personal') return { kind: 'personal', category: rule.category }
    if (rule.action === 'group') return { kind: 'group_pending_split', group_id: rule.group_id! }
    return { kind: 'ignore' }
  }
  return { kind: 'review', reviewKind: 'unrouted_txn' }
}
