-- Run with: supabase test db
begin;
select plan(6);

-- ---------- seed: two members, one shared group + one lifecycle group ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev');

insert into groups (id, name, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Goa Trip', '00000000-0000-0000-0000-00000000000a'),
  ('44444444-4444-4444-4444-444444444444', 'Weekend', '00000000-0000-0000-0000-00000000000a');
insert into group_members (group_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b');

-- ---------- act as Alice ----------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- transactions can route as settlements now
select lives_ok(
  $$insert into transactions (user_id, direction, amount, routed_status)
    values ('00000000-0000-0000-0000-00000000000a', 'debit', 500, 'settlement')$$,
  'transactions accept routed_status = settlement');

-- shared expense: Bob owes Alice 500
insert into expenses (id, group_id, paid_by, created_by, amount, description) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 1000, 'Villa');
insert into expense_splits (expense_id, user_id, share_amount) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', 500),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 500);

-- 1. unsettled balances block closing
select throws_ok(
  $$update groups set status = 'closed' where id = '11111111-1111-1111-1111-111111111111'$$,
  null, 'cannot close: balances not settled',
  'cannot close a group with unsettled balances');

-- 2. confirmed settlement zeroes nets -> close succeeds
insert into settlements (group_id, from_user, to_user, amount, status) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 500, 'confirmed');

select lives_ok(
  $$update groups set status = 'closed' where id = '11111111-1111-1111-1111-111111111111'$$,
  'settled group closes');

-- 3. closed groups are immutable (any column)
select throws_ok(
  $$update groups set name = 'renamed' where id = '11111111-1111-1111-1111-111111111111'$$,
  null, 'group is closed',
  'closed group rejects any update');

-- 4. active <-> settling is free
select lives_ok(
  $$update groups set status = 'settling' where id = '44444444-4444-4444-4444-444444444444'$$,
  'active -> settling allowed');
select lives_ok(
  $$update groups set status = 'active' where id = '44444444-4444-4444-4444-444444444444'$$,
  'settling -> active allowed');

select * from finish();
rollback;
