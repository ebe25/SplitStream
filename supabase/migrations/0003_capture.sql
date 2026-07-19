-- Phase 1: SMS capture. Devices push raw SMS via edge function;
-- parsed transactions land here and unroutable ones queue for review.

-- ---------- tables ----------

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  -- hex sha256 of the raw device token; raw token never stored
  token_hash text not null unique,
  created_at timestamptz default now(),
  last_seen_at timestamptz
);

create table raw_sms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  sender text not null,
  body text,
  received_at timestamptz not null,
  -- hex sha256(user_id || body || received_at), computed by the edge function
  dedupe_hash text not null,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  raw_sms_id uuid references raw_sms(id) on delete set null,
  direction text not null check (direction in ('debit', 'credit')),
  amount numeric(12,2) not null check (amount > 0),
  counterparty_raw text,
  account_tail text,
  bank_ref text,
  occurred_at timestamptz not null default now(),
  routed_status text not null default 'unrouted' check (routed_status in ('unrouted', 'personal', 'group', 'ignored')),
  created_at timestamptz default now()
);

create table review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('unrouted_txn', 'parse_failed')),
  transaction_id uuid references transactions(id) on delete cascade,
  raw_sms_id uuid references raw_sms(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create unique index raw_sms_user_dedupe on raw_sms (user_id, dedupe_hash);
create index on devices (user_id);
create index on transactions (user_id, created_at desc);
create index on review_items (user_id) where status = 'open';

-- ---------- RLS: owner-only, same pattern as personal_expenses_all ----------

alter table devices enable row level security;
alter table raw_sms enable row level security;
alter table transactions enable row level security;
alter table review_items enable row level security;

create policy devices_all on devices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy raw_sms_all on raw_sms for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_all on transactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy review_items_all on review_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
