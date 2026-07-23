// digests: cron-invoked daily push / weekly email summaries (see CONTEXT.md "Digest").
// Authed by X-Cron-Secret, not a user JWT. Deploy with:
//   supabase functions deploy digests --no-verify-jwt --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Per-user rollup of transactions + open review items since `since`.
// ponytail: grouped in JS, not SQL — a handful of users; move to a SQL group-by if rows explode.
async function rollup(since: Date) {
  const [{ data: txns, error: txnErr }, { data: items, error: itemErr }] = await Promise.all([
    supabase
      .from('transactions')
      .select('user_id, direction, amount')
      .gte('occurred_at', since.toISOString()),
    supabase.from('review_items').select('user_id').eq('status', 'open'),
  ]);
  if (txnErr) throw txnErr;
  if (itemErr) throw itemErr;

  const users = new Map<string, { txnCount: number; debitTotal: number; openItems: number }>();
  const get = (id: string) => {
    let u = users.get(id);
    if (!u) users.set(id, (u = { txnCount: 0, debitTotal: 0, openItems: 0 }));
    return u;
  };
  for (const t of txns ?? []) {
    const u = get(t.user_id);
    u.txnCount++;
    if (t.direction === 'debit') u.debitTotal += Number(t.amount);
  }
  for (const i of items ?? []) get(i.user_id).openItems++;
  return users;
}

async function daily(): Promise<{ sent: number; failed: number }> {
  const users = await rollup(new Date(Date.now() - 24 * 3600 * 1000));
  let sent = 0, failed = 0;
  for (const [userId, u] of users) {
    if (u.txnCount === 0 && u.openItems === 0) continue;
    try {
      const parts = [];
      if (u.txnCount) parts.push(`${rupees(u.debitTotal)} across ${u.txnCount} transaction${u.txnCount === 1 ? '' : 's'} yesterday`);
      if (u.openItems) parts.push(`${u.openItems} item${u.openItems === 1 ? '' : 's'} need you`);
      await sendPushToUser(supabase, userId, {
        title: 'SplitStream',
        body: parts.join(' · '),
        url: '/inbox',
      });
      sent++;
    } catch (err) {
      console.error('daily digest failed for', userId, err);
      failed++;
    }
  }
  return { sent, failed };
}

async function weekly(): Promise<{ sent: number; failed: number }> {
  const apiKey = Deno.env.get('EMAIL_API_KEY');
  if (!apiKey) {
    console.log('weekly digest: EMAIL_API_KEY unset, skipping emails');
    return { sent: 0, failed: 0 };
  }
  // DIGEST_FROM is 'Name <email>'; the email's domain must be attached to the
  // Maileroo sending key (see the Domains section of the Maileroo dashboard).
  const from = Deno.env.get('DIGEST_FROM') ?? 'SplitStream <digest@example.com>';
  const m = from.match(/^(.*?)\s*<(.+)>$/);
  const sender = m ? { display_name: m[1], address: m[2] } : { address: from };
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const users = await rollup(since);
  const [{ data: profiles, error: profErr }, { data: memberships, error: memErr }, { data: expenses, error: expErr }] =
    await Promise.all([
      supabase.from('profiles').select('id, email'),
      supabase.from('group_members').select('user_id, group_id'),
      supabase
        .from('expenses')
        .select('group_id, amount, groups(name)')
        .gte('occurred_at', since.toISOString()),
    ]);
  if (profErr) throw profErr;
  if (memErr) throw memErr;
  if (expErr) throw expErr;

  // ponytail: per-group weekly totals grouped in JS — few groups, few rows.
  const groupTotals = new Map<string, { name: string; total: number }>();
  for (const e of expenses ?? []) {
    const g = groupTotals.get(e.group_id) ?? {
      name: (e.groups as unknown as { name: string } | null)?.name ?? 'Group',
      total: 0,
    };
    g.total += Number(e.amount);
    groupTotals.set(e.group_id, g);
  }
  const userGroups = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    userGroups.set(m.user_id, [...(userGroups.get(m.user_id) ?? []), m.group_id]);
  }

  let sent = 0, failed = 0;
  for (const p of profiles ?? []) {
    const u = users.get(p.id);
    if (!u || (u.txnCount === 0 && u.openItems === 0)) continue;
    if (!p.email) continue;
    try {
      const groupRows = (userGroups.get(p.id) ?? [])
        .map((gid) => groupTotals.get(gid))
        .filter((g): g is { name: string; total: number } => !!g && g.total > 0)
        .map((g) => `<li>${g.name}: ${rupees(g.total)}</li>`)
        .join('');
      const html = `
        <h2>Your SplitStream week</h2>
        <p>${u.txnCount} transactions captured, ${rupees(u.debitTotal)} spent.</p>
        ${groupRows ? `<p>Group expenses this week:</p><ul>${groupRows}</ul>` : ''}
        <p>${u.openItems} item${u.openItems === 1 ? '' : 's'} awaiting your action.</p>
        <p><a href="${appUrl}/inbox">Open SplitStream</a></p>`;
      const res = await fetch('https://smtp.maileroo.com/api/v2/emails', {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: sender,
          to: [{ address: p.email }],
          subject: 'Your SplitStream weekly digest',
          html,
        }),
      });
      if (!res.ok) throw new Error(`maileroo ${res.status}: ${await res.text()}`);
      sent++;
    } catch (err) {
      console.error('weekly digest failed for', p.id, err);
      failed++;
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return json(503, { error: 'CRON_SECRET is not set; run `supabase secrets set CRON_SECRET=...`' });
  if (req.headers.get('x-cron-secret') !== secret) return json(401, { error: 'bad cron secret' });

  let kind: unknown;
  try {
    ({ kind } = await req.json());
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  if (kind !== 'daily' && kind !== 'weekly') return json(400, { error: "kind must be 'daily' or 'weekly'" });

  const { sent, failed } = kind === 'daily' ? await daily() : await weekly();
  return json(200, { kind, sent, failed });
});
