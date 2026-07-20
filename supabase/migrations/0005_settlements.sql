-- Phase 3: settlements. Transactions can route as settlements; closing a
-- group requires settled balances and closed groups are read-only.
-- Settlements themselves need nothing new: pending/confirmed exist since 0001.

-- ---------- transactions: settlement routing ----------

alter table transactions drop constraint transactions_routed_status_check;
alter table transactions add constraint transactions_routed_status_check
  check (routed_status in ('unrouted', 'personal', 'group', 'ignored', 'settlement'));

-- ---------- group lifecycle guard ----------

-- closed = immutable; closing requires every member's net to round to 0.00.
-- active <-> settling stays open to any member (RLS groups_update gates it).
create function public.check_group_lifecycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'closed' then
    raise exception 'group is closed';
  end if;
  if new.status = 'closed' then
    if exists (select 1 from group_balances(old.id) where round(net, 2) <> 0) then
      raise exception 'cannot close: balances not settled';
    end if;
  end if;
  return new;
end $$;

create trigger groups_lifecycle before update on groups
  for each row execute function public.check_group_lifecycle();

-- ---------- simplified_debts: allow service-role callers ----------

-- The settlement matcher (edge function, service role) needs suggestion
-- amounts, but auth.uid() is null under service role so the member check
-- always raised. Enforce membership only for real user sessions; anon and
-- public never had execute (revoked in 0001).
create or replace function public.simplified_debts(gid uuid)
returns table (from_user uuid, to_user uuid, amount numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  users uuid[];
  nets numeric[];
  i_debt int; i_cred int; i int;
  transfer numeric;
begin
  if auth.uid() is not null and not is_group_member(gid) then
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
