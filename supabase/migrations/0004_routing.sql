-- Phase 2: routing. Rules auto-route parsed transactions, payee identities
-- map UPI VPAs to known members, push subscriptions deliver nudges.

-- ---------- tables ----------

create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- normalized counterparty
  match_key text not null,
  action text not null check (action in ('personal', 'group', 'ignore')),
  category text,
  group_id uuid references groups(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, match_key),
  check (action <> 'group' or group_id is not null)
);

create table payee_identities (
  id uuid primary key default gen_random_uuid(),
  -- the owner who learned the mapping
  user_id uuid not null references profiles(id) on delete cascade,
  -- lowercase
  match_vpa text not null,
  member_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, match_vpa)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index on rules (user_id);
create index on payee_identities (user_id);

-- ---------- review_items: payload + new kinds ----------

alter table review_items add column payload jsonb;
alter table review_items drop constraint review_items_kind_check;
alter table review_items add constraint review_items_kind_check
  check (kind in ('unrouted_txn', 'parse_failed', 'choose_group', 'member_credit', 'pending_split'));

-- ---------- RLS: owner-only, same pattern as personal_expenses_all ----------

alter table rules enable row level security;
alter table payee_identities enable row level security;
alter table push_subscriptions enable row level security;

create policy rules_all on rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy payee_identities_all on payee_identities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_all on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- confirm a pending_split expense ----------

-- replace splits + flip status in ONE transaction; security invoker so RLS
-- (group membership) authorizes, and the deferred sum constraint fires at commit
create function public.confirm_expense_split(eid uuid, new_splits jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from expenses where id = eid) then
    raise exception 'expense % not found', eid;
  end if;
  delete from expense_splits where expense_id = eid;
  insert into expense_splits (expense_id, user_id, share_amount)
    select eid, (s ->> 'user_id')::uuid, (s ->> 'share_amount')::numeric
    from jsonb_array_elements(new_splits) s;
  update expenses set status = 'confirmed' where id = eid;
end $$;

revoke execute on function public.confirm_expense_split(uuid, jsonb) from anon, public;
grant execute on function public.confirm_expense_split(uuid, jsonb) to authenticated;
