-- Run with: supabase test db
-- Failing RLS test = release blocker.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev');

-- Bob's VPA seeded as superuser
insert into user_vpas (user_id, vpa) values
  ('00000000-0000-0000-0000-00000000000b', 'bob@okhdfcbank');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into user_vpas (user_id, vpa) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@ybl'),
  ('00000000-0000-0000-0000-00000000000a', 'alice@okicici');

select is(
  (select count(*)::int from user_vpas),
  2,
  'alice sees only her own VPAs, not bob''s'
);

select throws_ok(
  $$insert into user_vpas (user_id, vpa) values ('00000000-0000-0000-0000-00000000000b', 'evil@upi')$$,
  '42501',
  null,
  'alice cannot insert VPAs for bob'
);

select throws_ok(
  $$insert into user_vpas (user_id, vpa) values ('00000000-0000-0000-0000-00000000000a', 'alice@ybl')$$,
  '23505',
  null,
  'duplicate VPA per user rejected'
);

-- delete own row works (0 rows visible of bob's ⇒ his survives)
delete from user_vpas where vpa = 'alice@okicici';
select is(
  (select count(*)::int from user_vpas),
  1,
  'alice deleted her own VPA'
);

select * from finish();
rollback;
