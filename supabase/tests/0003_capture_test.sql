-- Run with: supabase test db
-- Failing RLS test = release blocker.
begin;
select plan(5);

-- ---------- seed two users (as superuser; triggers create profiles) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev');

-- ---------- act as Alice: capture an SMS -> transaction -> review item ----------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into raw_sms (id, user_id, sender, body, received_at, dedupe_hash) values
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-00000000000a',
   'HDFCBK', 'Rs 250 debited', '2026-07-19 10:00+00', 'hash-a1');
insert into transactions (id, user_id, raw_sms_id, direction, amount) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   '44444444-4444-4444-4444-444444444444', 'debit', 250);
insert into review_items (user_id, kind, transaction_id) values
  ('00000000-0000-0000-0000-00000000000a', 'unrouted_txn', '55555555-5555-5555-5555-555555555555');

-- dedupe: same (user_id, dedupe_hash) rejected
select throws_ok(
  $$insert into raw_sms (user_id, sender, received_at, dedupe_hash) values
    ('00000000-0000-0000-0000-00000000000a', 'HDFCBK', '2026-07-19 10:00+00', 'hash-a1')$$,
  '23505', null, 'duplicate (user_id, dedupe_hash) is rejected');

-- another user with the same hash is fine (dedupe is per-user)
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select lives_ok(
  $$insert into raw_sms (user_id, sender, received_at, dedupe_hash) values
    ('00000000-0000-0000-0000-00000000000b', 'HDFCBK', '2026-07-19 10:00+00', 'hash-a1')$$,
  'same dedupe_hash allowed for a different user');

-- ---------- owner-only: Bob sees none of Alice's rows ----------
select is((select count(*)::int from raw_sms where user_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'Bob cannot read Alice''s raw_sms');
select is((select count(*)::int from transactions), 0,
  'Bob cannot read Alice''s transactions');
select is((select count(*)::int from review_items), 0,
  'Bob cannot read Alice''s review_items');

select * from finish();
rollback;
