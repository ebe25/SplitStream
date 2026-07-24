-- Run with: supabase test db
-- Failing RLS test = release blocker.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- default: rows inserted without source are 'sms'
insert into raw_sms (user_id, sender, body, received_at, dedupe_hash) values
  ('00000000-0000-0000-0000-00000000000a', 'HDFCBK', 'Rs 250 debited',
   '2026-07-24 10:00+00', 'hash-a1');
select is(
  (select source from raw_sms where dedupe_hash = 'hash-a1'),
  'sms',
  'source defaults to sms'
);

-- notification capture: sender carries the app package name
select lives_ok(
  $$insert into raw_sms (user_id, sender, body, received_at, dedupe_hash, source) values
    ('00000000-0000-0000-0000-00000000000a', 'com.google.android.apps.nbu.paisa.user',
     'Paid Rs 250', '2026-07-24 10:01+00', 'hash-a2', 'app_notification')$$,
  'source app_notification accepted'
);

select throws_ok(
  $$insert into raw_sms (user_id, sender, received_at, dedupe_hash, source) values
    ('00000000-0000-0000-0000-00000000000a', 'HDFCBK', '2026-07-24 10:02+00', 'hash-a3', 'email')$$,
  '23514',
  null,
  'unknown source rejected by check constraint'
);

select * from finish();
rollback;
