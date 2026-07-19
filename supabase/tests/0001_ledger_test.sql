-- Run with: supabase test db
-- Failing RLS test = release blocker.
begin;
select plan(11);

-- ---------- seed two users (as superuser; triggers create profiles) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev');

-- ---------- act as Alice: create group + personal expense ----------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into groups (id, name, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Flat 402', '00000000-0000-0000-0000-00000000000a');
insert into personal_expenses (user_id, amount, category)
  values ('00000000-0000-0000-0000-00000000000a', 120, 'Food');

select is(
  (select count(*)::int from group_members where group_id = '11111111-1111-1111-1111-111111111111'),
  1, 'creator auto-joins own group');

-- ---------- Bob joins via invite code ----------
-- invite_code isn't readable pre-join (that's the point of join_group);
-- stash it as superuser so the test can pass it in like a shared link would.
reset role;
select set_config('app.invite', (select invite_code from groups where id = '11111111-1111-1111-1111-111111111111'), true);
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is(
  join_group(current_setting('app.invite')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'join_group adds Bob via invite code');

-- ---------- owner-only: Bob cannot see Alice's personal expenses ----------
select is((select count(*)::int from personal_expenses), 0,
  'Bob cannot read Alice''s personal expenses');

-- ---------- Alice logs a group expense, equal split ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into expenses (id, group_id, paid_by, created_by, amount, description) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 1000, 'Groceries');
insert into expense_splits (expense_id, user_id, share_amount) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', 500),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 500);

select lives_ok('set constraints all immediate', 'splits summing to amount pass the constraint');

-- mismatched splits rejected
insert into expenses (id, group_id, paid_by, created_by, amount) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 100);
insert into expense_splits (expense_id, user_id, share_amount) values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-00000000000a', 30);
select throws_ok('set constraints all immediate', null, null,
  'splits not summing to amount are rejected');
delete from expense_splits where expense_id = '33333333-3333-3333-3333-333333333333';
delete from expenses where id = '33333333-3333-3333-3333-333333333333';

-- ---------- membership-join: Carol (non-member) sees nothing ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';

select is((select count(*)::int from groups), 0, 'non-member cannot read the group');
select is((select count(*)::int from expenses), 0, 'non-member cannot read group expenses');
select throws_ok(
  $$select * from simplified_debts('11111111-1111-1111-1111-111111111111')$$,
  null, null, 'non-member cannot compute group debts');

-- ---------- balance math (as member Bob) ----------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select results_eq(
  $$select net::numeric(12,2) from group_balances('11111111-1111-1111-1111-111111111111')
    where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (-500.00::numeric(12,2))$$,
  'Bob owes 500 after equal split of 1000');

select results_eq(
  $$select from_user, to_user, amount::numeric(12,2)
    from simplified_debts('11111111-1111-1111-1111-111111111111')$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid,
            '00000000-0000-0000-0000-00000000000a'::uuid,
            500.00::numeric(12,2))$$,
  'simplified debts suggest Bob pays Alice 500');

-- settlement zeroes the balance
insert into settlements (group_id, from_user, to_user, amount, status) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 500, 'confirmed');

select results_eq(
  $$select sum(abs(net))::numeric(12,2) from group_balances('11111111-1111-1111-1111-111111111111')$$,
  $$values (0.00::numeric(12,2))$$,
  'confirmed settlement zeroes all balances');

select * from finish();
rollback;
