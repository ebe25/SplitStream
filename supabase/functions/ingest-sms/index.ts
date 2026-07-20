// ingest-sms: receives forwarded bank SMS from a device (MacroDroid), authed by
// X-Device-Token (not a user JWT). Deploy with:
//   supabase functions deploy ingest-sms --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseSms } from '../_shared/parser.ts';
import { route } from '../_shared/route.ts';
import { sendPushToUser } from '../_shared/push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Build the RouteContext for one user: co-members' VPAs across shared open
// groups, explicit payee identities, and the user's routing rules.
async function buildContext(ownerId: string) {
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
      const vpa = (m.profiles as { upi_vpa: string | null } | null)?.upi_vpa?.toLowerCase();
      if (vpa) vpaMembers[vpa] = { member_user_id: m.user_id, shared_open_group_ids: memberGroups.get(m.user_id)! };
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

  // (d) rules
  const { data: rules } = await supabase
    .from('rules')
    .select('match_key, action, category, group_id')
    .eq('user_id', ownerId);

  return { vpaMembers, rules: rules ?? [] };
}

// Apply a routing decision: ledger inserts, routed_status, review items, push.
async function applyAction(
  action: ReturnType<typeof route>,
  txn: {
    id: string;
    user_id: string;
    amount: number; // rupees, 2dp
    counterparty_raw: string | null;
    occurred_at: string;
    raw_sms_id: string;
  },
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

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const token = req.headers.get('x-device-token');
  if (!token) return json(401, { error: 'missing device token' });

  let payload: { sender?: unknown; body?: unknown; received_at?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const { sender, body, received_at } = payload;
  if (typeof sender !== 'string' || !sender ||
      typeof body !== 'string' || !body ||
      typeof received_at !== 'string' || Number.isNaN(Date.parse(received_at))) {
    return json(400, { error: 'sender, body, received_at (ISO) required' });
  }
  if (body.length > 2000) return json(400, { error: 'body too long' });

  const tokenHash = await sha256Hex(token);
  const { data: device } = await supabase
    .from('devices').select('id, user_id').eq('token_hash', tokenHash).maybeSingle();
  if (!device) return json(401, { error: 'unknown device' });

  await supabase.from('devices')
    .update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);

  const dedupeHash = await sha256Hex(device.user_id + body + received_at);
  const { data: rawSms, error: insertErr } = await supabase
    .from('raw_sms')
    .insert({
      user_id: device.user_id,
      device_id: device.id,
      sender,
      body,
      received_at,
      dedupe_hash: dedupeHash,
      parse_status: 'pending',
    })
    .select('id')
    .single();
  if (insertErr) {
    if (insertErr.code === '23505') return json(200, { status: 'duplicate' });
    console.error(insertErr);
    return json(500, { error: 'insert failed' });
  }

  const parsed = parseSms(sender, body);
  if (parsed) {
    await supabase.from('raw_sms').update({ parse_status: 'parsed' }).eq('id', rawSms.id);
    const amount = Math.round(parsed.amount) / 100; // paise -> rupees, 2dp
    const occurredAt = parsed.occurred_at ?? received_at;
    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        user_id: device.user_id,
        raw_sms_id: rawSms.id,
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
    if (txnErr) {
      console.error(txnErr);
      return json(500, { error: 'transaction insert failed' });
    }
    const ctx = await buildContext(device.user_id);
    const action = route(
      { direction: parsed.direction, amount, counterparty_raw: parsed.counterparty_raw },
      ctx,
    );
    await applyAction(action, {
      id: txn.id,
      user_id: device.user_id,
      amount,
      counterparty_raw: parsed.counterparty_raw,
      occurred_at: occurredAt,
      raw_sms_id: rawSms.id,
    });
  } else {
    await supabase.from('raw_sms').update({ parse_status: 'failed' }).eq('id', rawSms.id);
    await supabase.from('review_items').insert({
      user_id: device.user_id,
      kind: 'parse_failed',
      raw_sms_id: rawSms.id,
    });
  }

  return json(200, { status: 'created', parsed: !!parsed });
});
