-- Phase 5 (ADR 0002): multiple UPI IDs per user. Settlement matching reads all
-- of them; profiles.upi_vpa stays as the "primary" used for pay deep-links and
-- is kept in sync by the app (oldest VPA wins).

create table user_vpas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  vpa text not null, -- lowercase
  created_at timestamptz default now(),
  unique (user_id, vpa)
);

create index on user_vpas (user_id);

alter table user_vpas enable row level security;
create policy user_vpas_all on user_vpas for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- backfill from the single-column era
insert into user_vpas (user_id, vpa)
  select id, lower(upi_vpa) from profiles where upi_vpa is not null
  on conflict do nothing;
