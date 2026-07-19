-- Phase 0: ledger core. Ingestion tables arrive in 0002_capture.sql.

-- ---------- tables ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  upi_vpa text,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id),
  status text not null default 'active' check (status in ('active', 'settling', 'closed')),
  invite_code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 12),
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table personal_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  category text,
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  paid_by uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  -- pending_split: auto-captured, awaiting split choice (Phase 2)
  status text not null default 'confirmed' check (status in ('pending_split', 'confirmed')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table expense_splits (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  share_amount numeric(12,2) not null check (share_amount >= 0),
  primary key (expense_id, user_id)
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index on group_members (user_id);
create index on personal_expenses (user_id, occurred_at desc);
create index on expenses (group_id, occurred_at desc);
create index on settlements (group_id);

-- ---------- triggers ----------

-- auth.users insert -> profiles row
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- group creator is automatically a member
create function public.add_creator_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id) values (new.id, new.created_by);
  return new;
end $$;

create trigger on_group_created
  after insert on groups
  for each row execute function public.add_creator_membership();

-- splits must sum to the expense amount (deferred so expense + splits
-- can be inserted in one transaction). pending_split expenses are exempt.
create function public.check_split_sum() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  exp record;
  split_total numeric;
begin
  select * into exp from expenses
    where id = coalesce(new.expense_id, old.expense_id);
  if exp is null or exp.status = 'pending_split' then
    return null;
  end if;
  select coalesce(sum(share_amount), 0) into split_total
    from expense_splits where expense_id = exp.id;
  if split_total <> exp.amount then
    raise exception 'expense_splits for % sum to %, expected %', exp.id, split_total, exp.amount;
  end if;
  return null;
end $$;

create constraint trigger enforce_split_sum
  after insert or update or delete on expense_splits
  deferrable initially deferred
  for each row execute function public.check_split_sum();

create function public.check_expense_split_sum() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  split_total numeric;
begin
  if new.status = 'pending_split' then
    return null;
  end if;
  select coalesce(sum(share_amount), 0) into split_total
    from expense_splits where expense_id = new.id;
  if split_total <> new.amount then
    raise exception 'expense % amount % does not match splits total %', new.id, new.amount, split_total;
  end if;
  return null;
end $$;

create constraint trigger enforce_expense_split_sum
  after insert or update on expenses
  deferrable initially deferred
  for each row execute function public.check_expense_split_sum();

-- ---------- RLS ----------

-- security definer to break RLS recursion on group_members
create function public.is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from group_members where group_id = gid and user_id = auth.uid()) $$;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table personal_expenses enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;

-- profiles: self, plus members of shared groups (to render names)
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy profiles_update on profiles for update using (id = auth.uid());

-- groups: members only; anyone can create a group they own
create policy groups_select on groups for select using (is_group_member(id));
create policy groups_insert on groups for insert with check (created_by = auth.uid());
create policy groups_update on groups for update using (is_group_member(id));

-- group_members: visible to fellow members; leave = delete self.
-- inserts happen only via the creator trigger and join_group() (both security definer).
create policy group_members_select on group_members for select using (is_group_member(group_id));
create policy group_members_delete on group_members for delete using (user_id = auth.uid());

-- personal tables: owner-only
create policy personal_expenses_all on personal_expenses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- group tables: membership-join
create policy expenses_select on expenses for select using (is_group_member(group_id));
create policy expenses_insert on expenses for insert
  with check (is_group_member(group_id) and created_by = auth.uid());
create policy expenses_update on expenses for update using (is_group_member(group_id));
create policy expenses_delete on expenses for delete using (is_group_member(group_id));

create policy expense_splits_select on expense_splits for select
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)));
create policy expense_splits_write on expense_splits for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)));

create policy settlements_select on settlements for select using (is_group_member(group_id));
create policy settlements_insert on settlements for insert
  with check (is_group_member(group_id) and (from_user = auth.uid() or to_user = auth.uid()));
create policy settlements_update on settlements for update using (is_group_member(group_id));

-- group lifecycle gate: settling groups accept only settlements; closed groups are read-only
create function public.check_group_open() returns trigger
language plpgsql security definer set search_path = public as $$
declare gstatus text;
begin
  select status into gstatus from groups where id = new.group_id;
  if gstatus <> 'active' then
    raise exception 'group is %, no new expenses allowed', gstatus;
  end if;
  return new;
end $$;

create trigger expenses_group_open before insert on expenses
  for each row execute function public.check_group_open();

create function public.check_group_not_closed() returns trigger
language plpgsql security definer set search_path = public as $$
declare gstatus text;
begin
  select status into gstatus from groups where id = new.group_id;
  if gstatus = 'closed' then
    raise exception 'group is closed';
  end if;
  return new;
end $$;

create trigger settlements_group_not_closed before insert on settlements
  for each row execute function public.check_group_not_closed();

-- ---------- balance math ----------

-- net > 0: is owed money; net < 0: owes money
create function public.group_balances(gid uuid)
returns table (user_id uuid, paid numeric, share numeric, net numeric)
language sql stable security invoker set search_path = public as $$
  with members as (
    select gm.user_id from group_members gm where gm.group_id = gid
  ),
  paid as (
    select e.paid_by as user_id, sum(e.amount) as total
    from expenses e where e.group_id = gid and e.status = 'confirmed'
    group by e.paid_by
  ),
  shares as (
    select es.user_id, sum(es.share_amount) as total
    from expense_splits es
    join expenses e on e.id = es.expense_id
    where e.group_id = gid and e.status = 'confirmed'
    group by es.user_id
  ),
  settled as (
    select s.from_user as user_id, sum(s.amount) as paid_out, 0::numeric as received
    from settlements s where s.group_id = gid and s.status = 'confirmed'
    group by s.from_user
    union all
    select s.to_user, 0, sum(s.amount)
    from settlements s where s.group_id = gid and s.status = 'confirmed'
    group by s.to_user
  ),
  settle_net as (
    select user_id, sum(paid_out) - sum(received) as net from settled group by user_id
  )
  select
    m.user_id,
    coalesce(p.total, 0) as paid,
    coalesce(sh.total, 0) as share,
    coalesce(p.total, 0) - coalesce(sh.total, 0) + coalesce(sn.net, 0) as net
  from members m
  left join paid p on p.user_id = m.user_id
  left join shares sh on sh.user_id = m.user_id
  left join settle_net sn on sn.user_id = m.user_id
$$;

-- greedy min-transaction settlement suggestions
create function public.simplified_debts(gid uuid)
returns table (from_user uuid, to_user uuid, amount numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  users uuid[];
  nets numeric[];
  i_debt int; i_cred int; i int;
  transfer numeric;
begin
  if not is_group_member(gid) then
    raise exception 'not a member of group %', gid;
  end if;

  select array_agg(b.user_id), array_agg(b.net)
    into users, nets
    from group_balances(gid) b where b.net <> 0;

  if users is null then return; end if;

  loop
    i_debt := null; i_cred := null;
    for i in 1 .. array_length(users, 1) loop
      if nets[i] < -0.005 and (i_debt is null or nets[i] < nets[i_debt]) then i_debt := i; end if;
      if nets[i] >  0.005 and (i_cred is null or nets[i] > nets[i_cred]) then i_cred := i; end if;
    end loop;
    exit when i_debt is null or i_cred is null;

    transfer := round(least(-nets[i_debt], nets[i_cred]), 2);
    from_user := users[i_debt];
    to_user := users[i_cred];
    amount := transfer;
    return next;

    nets[i_debt] := nets[i_debt] + transfer;
    nets[i_cred] := nets[i_cred] - transfer;
  end loop;
end $$;

-- ---------- invites ----------

-- SECURITY DEFINER so joining doesn't require public read on groups
create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from groups where invite_code = code and status = 'active';
  if gid is null then
    raise exception 'invalid or inactive invite code';
  end if;
  insert into group_members (group_id, user_id)
    values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end $$;

-- expense + splits in ONE transaction (the deferred split-sum constraint
-- would reject an expense inserted without its splits via separate API calls)
create function public.create_group_expense(
  gid uuid, payer uuid, amt numeric, descr text, splits jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare eid uuid;
begin
  insert into expenses (group_id, paid_by, created_by, amount, description)
    values (gid, payer, auth.uid(), amt, descr)
    returning id into eid;
  insert into expense_splits (expense_id, user_id, share_amount)
    select eid, (s ->> 'user_id')::uuid, (s ->> 'share_amount')::numeric
    from jsonb_array_elements(splits) s;
  return eid;
end $$;

-- lock down function execution
revoke execute on all functions in schema public from anon, public;
grant execute on function public.create_group_expense(uuid, uuid, numeric, text, jsonb) to authenticated;
grant execute on function public.group_balances(uuid) to authenticated;
grant execute on function public.simplified_debts(uuid) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
