// reprocess: cron sweep that retries stuck ingest work — raw_sms is the queue,
// parse_status/routed_status are the message states. Two legs:
//   1. raw_sms stuck 'pending' (crash mid-ingest) or 'failed' (parser gap,
//      possibly fixed since) -> re-parse and run the full pipeline
//   2. transactions still 'unrouted' with no review item (crash before routing
//      left any trace) -> re-route
// Authed by X-Cron-Secret (same as digests). Deploy with:
//   supabase functions deploy reprocess --no-verify-jwt --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseSms } from '../_shared/parser.ts';
import { processParsed, rerouteTransaction } from '../_shared/pipeline.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return json(503, { error: 'CRON_SECRET is not set; run `supabase secrets set CRON_SECRET=...`' });
  if (req.headers.get('x-cron-secret') !== secret) return json(401, { error: 'bad cron secret' });

  // skip rows younger than 10 min: live ingest may still be mid-flight on them
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let reparsed = 0, stillFailed = 0, rerouted = 0;
  const errored: string[] = [];

  // ---- leg 1: stuck raw_sms ----
  const { data: stuck, error: stuckErr } = await supabase
    .from('raw_sms')
    .select('id, user_id, body, received_at, parse_status')
    .in('parse_status', ['pending', 'failed'])
    .not('body', 'is', null) // bodies purge after 30d once review is resolved; nothing to retry then
    .lt('created_at', cutoff)
    .limit(100); // ponytail: paginate if a backlog ever exceeds this
  if (stuckErr) return json(500, { error: stuckErr.message });

  for (const row of stuck ?? []) {
    try {
      const parsed = parseSms(row.body as string);
      if (!parsed) {
        if (row.parse_status === 'pending') {
          await supabase.from('raw_sms').update({ parse_status: 'failed' }).eq('id', row.id);
          await supabase.from('review_items').insert({
            user_id: row.user_id,
            kind: 'parse_failed',
            raw_sms_id: row.id,
          });
        }
        stillFailed++;
        continue;
      }
      await processParsed(supabase, {
        userId: row.user_id,
        rawSmsId: row.id,
        parsed,
        receivedAt: row.received_at,
      });
      await supabase.from('review_items')
        .delete()
        .eq('raw_sms_id', row.id)
        .eq('kind', 'parse_failed')
        .eq('status', 'open');
      await supabase.from('raw_sms').update({ parse_status: 'parsed' }).eq('id', row.id);
      reparsed++;
    } catch (err) {
      console.error('reprocess raw_sms failed', row.id, err);
      errored.push(row.id);
    }
  }

  // ---- leg 2: transactions inserted but never routed ----
  // A review item means routing DID run and is waiting on the user — skip those.
  const { data: unrouted, error: unroutedErr } = await supabase
    .from('transactions')
    .select('id, user_id, direction, amount, counterparty_raw, occurred_at, raw_sms_id, review_items(id)')
    .eq('routed_status', 'unrouted')
    .lt('created_at', cutoff)
    .limit(100);
  if (unroutedErr) return json(500, { error: unroutedErr.message });

  for (const t of unrouted ?? []) {
    if ((t.review_items as { id: string }[] | null)?.length) continue;
    try {
      await rerouteTransaction(supabase, {
        id: t.id,
        user_id: t.user_id,
        direction: t.direction as 'debit' | 'credit',
        amount: Number(t.amount),
        counterparty_raw: t.counterparty_raw,
        occurred_at: t.occurred_at,
        raw_sms_id: t.raw_sms_id,
      });
      rerouted++;
    } catch (err) {
      console.error('reprocess txn failed', t.id, err);
      errored.push(t.id);
    }
  }

  return json(200, { reparsed, still_failed: stillFailed, rerouted, errored });
});
