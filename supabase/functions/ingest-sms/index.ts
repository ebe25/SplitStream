// ingest-sms: receives forwarded bank SMS from a device (MacroDroid), authed by
// X-Device-Token (not a user JWT). Deploy with:
//   supabase functions deploy ingest-sms --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseSms } from '../_shared/parser.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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
    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        user_id: device.user_id,
        raw_sms_id: rawSms.id,
        direction: parsed.direction,
        amount: Math.round(parsed.amount) / 100, // paise -> rupees, 2dp
        counterparty_raw: parsed.counterparty_raw,
        account_tail: parsed.account_tail,
        bank_ref: parsed.bank_ref,
        occurred_at: parsed.occurred_at ?? received_at,
        routed_status: 'unrouted',
      })
      .select('id')
      .single();
    if (txnErr) {
      console.error(txnErr);
      return json(500, { error: 'transaction insert failed' });
    }
    await supabase.from('review_items').insert({
      user_id: device.user_id,
      kind: 'unrouted_txn',
      transaction_id: txn.id,
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
