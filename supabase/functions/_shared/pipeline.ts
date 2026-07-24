// pipeline.ts: parsed-SMS -> ledger steps, shared by ingest-sms (live path) and
// reprocess (cron sweep). Hand-managed — NOT overwritten by `pnpm sync:functions`
// (that only copies parser.ts and route.ts).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ParsedSms } from './parser.ts';
import { route } from './route.ts';
import { sendPushToUser } from './push.ts';

export type TxnForRouting = {
  id: string;
  user_id: string;
  direction: 'debit' | 'credit';
  amount: number; // rupees, 2dp
  counterparty_raw: string | null;
  occurred_at: string;
  raw_sms_id: string | null;
};

// Build the RouteContext for one user: co-members' VPAs across shared open
// groups, explicit payee identities, the user's routing rules, and exact
// per-member debt amounts for the settlement matcher.
export async function buildContext(supabase: SupabaseClient, ownerId: string) {
  // (a) owner's open groups
  const { data: mine } = await supabase
    .from('group_members')
    .select('group_id, groups!inner(status)')
    .eq('user_id', ownerId)
    .eq('groups.status', 'active');
  const groupIds = (mine ?? []).map((r) => r.group_id);

  // (b) co-members of those groups + their VPAs
  const memberGroups = new Map<string, string[]>(); // member_user_id -> shared open group ids
  const vpaMembers: Record<string, { member_user_id: string; shared_open_group_ids: string[] }> = {};
  if (groupIds.length) {
    const { data: members } = await supabase
      .from('group_members')
      .select('group_id, user_id, profiles(upi_vpa)')
      .in('group_id', groupIds)
      .neq('user_id', ownerId);
    for (const m of members ?? []) {
      memberGroups.set(m.user_id, [...(memberGroups.get(m.user_id) ?? []), m.group_id]);
    }
    for (const m of members ?? []) {
      const vpa = (m.profiles as unknown as { upi_vpa: string | null } | null)?.upi_vpa?.toLowerCase();
      if (vpa) vpaMembers[vpa] = { member_user_id: m.user_id, shared_open_group_ids: memberGroups.get(m.user_id)! };
    }

    // (b2) every additional VPA a co-member registered (multi-VPA, ADR 0002)
    const { data: memberVpas } = await supabase
      .from('user_vpas')
      .select('user_id, vpa')
      .in('user_id', [...memberGroups.keys()]);
    for (const v of memberVpas ?? []) {
      vpaMembers[v.vpa.toLowerCase()] = {
        member_user_id: v.user_id,
        shared_open_group_ids: memberGroups.get(v.user_id)!,
      };
    }
  }

  // (c) explicit payee identities extend/override the VPA map
  const { data: identities } = await supabase
    .from('payee_identities')
    .select('match_vpa, member_user_id')
    .eq('user_id', ownerId);
  for (const pi of identities ?? []) {
    vpaMembers[pi.match_vpa.toLowerCase()] = {
      member_user_id: pi.member_user_id,
      shared_open_group_ids: memberGroups.get(pi.member_user_id) ?? [],
    };
  }

  // (d) exact amounts the settlement matcher can hit, per (co-member, group):
  // simplified-debt suggestions plus, in 2-person groups, the raw net.
  const memberDebts: {
    member_user_id: string;
    group_id: string;
    i_owe_amounts: number[]; // paise
    owed_to_me_amounts: number[]; // paise
  }[] = [];
  const toPaise = (x: unknown) => Math.round(Number(x) * 100);
  for (const gid of groupIds) {
    const { data: balances, error: balErr } = await supabase.rpc('group_balances', { gid });
    if (balErr || !balances) { console.error('group_balances failed', gid, balErr); continue; }
    const { data: debts, error: debtErr } = await supabase.rpc('simplified_debts', { gid });
    if (debtErr) console.error('simplified_debts failed', gid, debtErr);
    const myNet = toPaise(
      (balances as { user_id: string; net: number }[]).find((b) => b.user_id === ownerId)?.net ?? 0,
    );
    const twoPerson = (balances as unknown[]).length === 2;
    for (const [memberId, gids] of memberGroups) {
      if (!gids.includes(gid)) continue;
      const iOwe = new Set<number>();
      const owedToMe = new Set<number>();
      for (const d of (debts ?? []) as { from_user: string; to_user: string; amount: number }[]) {
        if (d.from_user === ownerId && d.to_user === memberId) iOwe.add(toPaise(d.amount));
        if (d.from_user === memberId && d.to_user === ownerId) owedToMe.add(toPaise(d.amount));
      }
      if (twoPerson && myNet < 0) iOwe.add(-myNet);
      if (twoPerson && myNet > 0) owedToMe.add(myNet);
      if (iOwe.size || owedToMe.size) {
        memberDebts.push({
          member_user_id: memberId,
          group_id: gid,
          i_owe_amounts: [...iOwe],
          owed_to_me_amounts: [...owedToMe],
        });
      }
    }
  }

  // (e) rules
  const { data: rules } = await supabase
    .from('rules')
    .select('match_key, action, category, group_id')
    .eq('user_id', ownerId);

  return { vpaMembers, rules: rules ?? [], memberDebts };
}

// Apply a routing decision: ledger inserts, routed_status, review items, push.
export async function applyAction(
  supabase: SupabaseClient,
  action: ReturnType<typeof route>,
  txn: TxnForRouting,
) {
  const who = txn.counterparty_raw ?? 'unknown';
  const setStatus = (s: string) =>
    supabase.from('transactions').update({ routed_status: s }).eq('id', txn.id);
  const review = (kind: string, payload?: unknown) =>
    supabase.from('review_items').insert({
      user_id: txn.user_id,
      kind,
      transaction_id: txn.id,
      raw_sms_id: txn.raw_sms_id,
      ...(payload ? { payload } : {}),
    });
  const push = (body: string) =>
    sendPushToUser(supabase, txn.user_id, { title: 'SplitStream', body, url: '/inbox' });

  switch (action.kind) {
    case 'personal': {
      const { error } = await supabase.from('personal_expenses').insert({
        user_id: txn.user_id,
        amount: txn.amount,
        category: action.category,
        description: txn.counterparty_raw,
        occurred_at: txn.occurred_at,
      });
      // ponytail: on insert failure fall back to the review inbox instead of dropping the txn
      if (error) { console.error(error); await review('unrouted_txn'); return; }
      await setStatus('personal');
      return;
    }
    case 'group_pending_split': {
      const { data: exp, error } = await supabase
        .from('expenses')
        .insert({
          group_id: action.group_id,
          paid_by: txn.user_id,
          created_by: txn.user_id,
          amount: txn.amount,
          description: txn.counterparty_raw,
          status: 'pending_split',
          occurred_at: txn.occurred_at,
        })
        .select('id')
        .single();
      if (error) { console.error(error); await review('unrouted_txn'); return; }
      await review('pending_split', { expense_id: exp.id, group_id: action.group_id });
      await setStatus('group');
      await push(`₹${txn.amount} to ${who} — how to split?`);
      return;
    }
    case 'settlement_out': {
      // debit that exactly matches what I owe this member -> pending settlement
      // (ADR 0001: payer-side records await the recipient). Dedupe against "I paid".
      const { data: existing, error: selErr } = await supabase
        .from('settlements')
        .select('id')
        .eq('group_id', action.group_id)
        .eq('from_user', txn.user_id)
        .eq('to_user', action.member_user_id)
        .eq('status', 'pending')
        .eq('amount', txn.amount.toFixed(2))
        .limit(1);
      if (selErr) { console.error(selErr); await review('unrouted_txn'); return; }
      if (!existing?.length) {
        const { error } = await supabase.from('settlements').insert({
          group_id: action.group_id,
          from_user: txn.user_id,
          to_user: action.member_user_id,
          amount: txn.amount,
          status: 'pending',
        });
        if (error) { console.error(error); await review('unrouted_txn'); return; }
        await sendPushToUser(supabase, action.member_user_id, {
          title: 'SplitStream',
          body: `You have a ₹${txn.amount} settlement to confirm`,
          url: `/group/${action.group_id}`,
        });
      }
      await setStatus('settlement');
      return;
    }
    case 'settlement_in': {
      // credit that exactly matches what a member owes me. Receiving is
      // confirmation (ADR 0001): confirm the matching pending row, else insert confirmed.
      const { data: pending, error: selErr } = await supabase
        .from('settlements')
        .select('id')
        .eq('group_id', action.group_id)
        .eq('from_user', action.member_user_id)
        .eq('to_user', txn.user_id)
        .eq('status', 'pending')
        .eq('amount', txn.amount.toFixed(2))
        .limit(1);
      if (selErr) { console.error(selErr); await review('unrouted_txn'); return; }
      if (pending?.length) {
        const { error } = await supabase
          .from('settlements').update({ status: 'confirmed' }).eq('id', pending[0].id);
        if (error) { console.error(error); await review('unrouted_txn'); return; }
      } else {
        const { error } = await supabase.from('settlements').insert({
          group_id: action.group_id,
          from_user: action.member_user_id,
          to_user: txn.user_id,
          amount: txn.amount,
          status: 'confirmed',
        });
        if (error) { console.error(error); await review('unrouted_txn'); return; }
      }
      await setStatus('settlement');
      await sendPushToUser(supabase, action.member_user_id, {
        title: 'SplitStream',
        body: `Your ₹${txn.amount} settlement was confirmed`,
        url: `/group/${action.group_id}`,
      });
      return;
    }
    case 'ignore':
      await setStatus('ignored');
      return;
    case 'review':
      if (action.reviewKind === 'unrouted_txn') {
        await review('unrouted_txn');
        await push(`₹${txn.amount} to ${who} — Personal, group, or ignore?`);
      } else {
        await review(action.reviewKind, {
          member_user_id: action.member_user_id,
          group_ids: action.group_ids,
        });
        await push(
          action.reviewKind === 'choose_group'
            ? `₹${txn.amount} to ${who} — which group?`
            : `₹${txn.amount} from ${who} — a group member paid you. Settle up?`,
        );
      }
      return;
  }
}

// Full ledger flow for one parsed SMS: duplicate-alert window check, transaction
// insert, then routing. Throws on DB errors — callers decide retry semantics
// (ingest returns 500 + the row stays 'pending' for the reprocess sweep).
export async function processParsed(
  supabase: SupabaseClient,
  args: { userId: string; rawSmsId: string; parsed: ParsedSms; receivedAt: string },
): Promise<{ duplicateAlert: boolean }> {
  const { userId, rawSmsId, parsed, receivedAt } = args;
  const amount = Math.round(parsed.amount) / 100; // paise -> rupees, 2dp
  const occurredAt = parsed.occurred_at ?? receivedAt;

  // Duplicate alert (CONTEXT.md): the same real payment announced twice
  // (bank SMS + UPI app SMS) with differing bank refs — same ref was already
  // caught by dedupe_hash. Equal amount + direction in the window = duplicate.
  // Also makes the sweep idempotent: a crashed run that already inserted the
  // transaction is caught here on re-run.
  // ponytail: 2-min fixed window; make configurable if false-positives appear
  // with recurring equal payments.
  const t = Date.parse(occurredAt);
  const { data: dupes, error: dupErr } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('direction', parsed.direction)
    .eq('amount', amount.toFixed(2))
    .gte('occurred_at', new Date(t - 2 * 60 * 1000).toISOString())
    .lte('occurred_at', new Date(t + 2 * 60 * 1000).toISOString())
    .limit(1);
  if (dupErr) throw dupErr;
  if (dupes?.length) return { duplicateAlert: true };

  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      raw_sms_id: rawSmsId,
      direction: parsed.direction,
      amount,
      counterparty_raw: parsed.counterparty_raw,
      account_tail: parsed.account_tail,
      bank_ref: parsed.bank_ref,
      occurred_at: occurredAt,
      routed_status: 'unrouted',
    })
    .select('id')
    .single();
  if (txnErr) throw txnErr;

  await rerouteTransaction(supabase, {
    id: txn.id,
    user_id: userId,
    direction: parsed.direction,
    amount,
    counterparty_raw: parsed.counterparty_raw,
    occurred_at: occurredAt,
    raw_sms_id: rawSmsId,
  });
  return { duplicateAlert: false };
}

// Route (or re-route) an inserted transaction. Used by processParsed and by the
// sweep for transactions whose routing crashed before leaving a trace.
export async function rerouteTransaction(supabase: SupabaseClient, txn: TxnForRouting) {
  const ctx = await buildContext(supabase, txn.user_id);
  const action = route(
    { direction: txn.direction, amount: txn.amount, counterparty_raw: txn.counterparty_raw },
    ctx,
  );
  await applyAction(supabase, action, txn);
}
