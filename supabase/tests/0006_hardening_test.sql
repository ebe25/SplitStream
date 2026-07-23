-- Run with: supabase test db
begin;
select plan(5);

-- ---------- seed (as superuser; trigger creates the profile) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev');

-- explicit created_at: superuser bypasses RLS and column defaults
insert into raw_sms (id, user_id, sender, body, received_at, dedupe_hash, parse_status, created_at) values
  -- old + parsed -> purged
  ('66666666-6666-6666-6666-666666666601', '00000000-0000-0000-0000-00000000000a',
   'HDFCBK', 'Rs 100 debited', now() - interval '40 days', 'h-old-parsed', 'parsed', now() - interval '40 days'),
  -- recent + parsed -> kept
  ('66666666-6666-6666-6666-666666666602', '00000000-0000-0000-0000-00000000000a',
   'HDFCBK', 'Rs 200 debited', now(), 'h-recent-parsed', 'parsed', now()),
  -- old + failed, review open -> kept
  ('66666666-6666-6666-6666-666666666603', '00000000-0000-0000-0000-00000000000a',
   'HDFCBK', 'garbled 300', now() - interval '40 days', 'h-old-failed-open', 'failed', now() - interval '40 days'),
  -- old + failed, review resolved -> purged
  ('66666666-6666-6666-6666-666666666604', '00000000-0000-0000-0000-00000000000a',
   'HDFCBK', 'garbled 400', now() - interval '40 days', 'h-old-failed-resolved', 'failed', now() - interval '40 days');

insert into review_items (user_id, kind, raw_sms_id, status, resolved_at) values
  ('00000000-0000-0000-0000-00000000000a', 'parse_failed', '66666666-6666-6666-6666-666666666603', 'open', null),
  ('00000000-0000-0000-0000-00000000000a', 'parse_failed', '66666666-6666-6666-6666-666666666604', 'resolved', now());

-- ---------- purge ----------
select public.purge_old_sms();

select is((select body from raw_sms where id = '66666666-6666-6666-6666-666666666601'),
  null, 'old parsed body is purged');
select is((select body from raw_sms where id = '66666666-6666-6666-6666-666666666602'),
  'Rs 200 debited', 'recent parsed body is kept');
select is((select body from raw_sms where id = '66666666-6666-6666-6666-666666666603'),
  'garbled 300', 'old failed body with open review is kept');
select is((select body from raw_sms where id = '66666666-6666-6666-6666-666666666604'),
  null, 'old failed body with resolved review is purged');

-- ---------- cron_config: RLS with no policies hides it from clients ----------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select throws_ok(
  'select * from cron_config', '42501', null,
  'cron_config is revoked from authenticated (0007)');

select * from finish();
rollback;
