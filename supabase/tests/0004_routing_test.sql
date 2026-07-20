-- Run with: supabase test db
-- Failing RLS test = release blocker.
begin;
select plan(9);

-- ---------- seed users (as superuser; triggers create profiles) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev');

-- ---------- Alice: group (Bob added as superuser) + routing rows ----------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into groups (id, name, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Flat 402', '00000000-0000-0000-0000-00000000000a');

reset role;
insert into group_members (group_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into rules (user_id, match_key, action, group_id) values
  ('00000000-0000-0000-0000-00000000000a', 'bigbasket', 'group', '11111111-1111-1111-1111-111111111111');
insert into payee_identities (user_id, match_vpa, member_user_id) values
  ('00000000-0000-0000-0000-00000000000a', 'bob@upi', '00000000-0000-0000-0000-00000000000b');
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-00000000000a', 'https://push.test/ep1', 'key', 'secret');

select lives_ok(
  $$insert into review_items (user_id, kind, payload) values
    ('00000000-0000-0000-0000-00000000000a', 'choose_group', '{"candidates": []}')$$,
  'new review_items kind with payload accepted');

-- ---------- owner-only: Bob sees none of Alice's routing rows ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is((select count(*)::int from rules), 0, 'Bob cannot read Alice''s rules');
select is((select count(*)::int from payee_identities), 0, 'Bob cannot read Alice''s payee_identities');
select is((select count(*)::int from push_subscriptions), 0, 'Bob cannot read Alice''s push_subscriptions');

-- ---------- confirm_expense_split: happy path ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into expenses (id, group_id, paid_by, created_by, amount, description, status) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
   100, 'Auto-captured', 'pending_split');

select lives_ok(
  $$select confirm_expense_split('22222222-2222-2222-2222-222222222222',
    '[{"user_id": "00000000-0000-0000-0000-00000000000a", "share_amount": 50},
      {"user_id": "00000000-0000-0000-0000-00000000000b", "share_amount": 50}]')$$,
  'payer confirms split on pending_split expense');

select is(
  (select status from expenses where id = '22222222-2222-2222-2222-222222222222'),
  'confirmed', 'expense status flips to confirmed');
select lives_ok('set constraints all immediate', 'confirmed splits pass the sum constraint');
select is(
  (select sum(share_amount)::numeric(12,2) from expense_splits
    where expense_id = '22222222-2222-2222-2222-222222222222'),
  100.00::numeric(12,2), 'splits sum to expense amount');

-- ---------- non-member cannot confirm ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';

select throws_ok(
  $$select confirm_expense_split('22222222-2222-2222-2222-222222222222',
    '[{"user_id": "00000000-0000-0000-0000-00000000000c", "share_amount": 100}]')$$,
  null, null, 'non-member cannot confirm_expense_split');

select * from finish();
rollback;
