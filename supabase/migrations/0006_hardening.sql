-- Phase 4: hardening. SMS body retention, duplicate-alert lookup index,
-- and scheduled jobs (guarded: vanilla postgres has no pg_cron/pg_net).

-- ---------- retention: null out SMS bodies older than 30 days ----------

-- parsed: always purge. failed: purge only once its review item is resolved
-- (an open parse_failed review still needs the body for manual triage).
create function public.purge_old_sms() returns void
language sql security definer set search_path = public as $$
  update raw_sms set body = null
    where body is not null
      and created_at < now() - interval '30 days'
      and (parse_status = 'parsed'
        or (parse_status = 'failed' and not exists (
              select 1 from review_items ri
              where ri.raw_sms_id = raw_sms.id and ri.status = 'open')));
$$;

-- cron-only; clients never call this
revoke execute on function public.purge_old_sms() from anon, authenticated, public;

-- ---------- duplicate-alert lookup ----------

-- ingest checks: same user + direction + amount within a short occurred_at window
create index transactions_dup_lookup on transactions (user_id, direction, amount, occurred_at);

-- ---------- cron secret ----------

-- RLS enabled, NO policies: invisible to anon/authenticated; readable only by
-- service role and direct SQL (cron). After deploy: update cron_config set secret = '...';
create table cron_config (secret text not null);
alter table cron_config enable row level security;
insert into cron_config (secret)
  select 'CHANGE-ME' where not exists (select 1 from cron_config);

-- ---------- scheduled jobs ----------

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-old-sms', '30 3 * * *',
      $job$select public.purge_old_sms()$job$);
  else
    raise notice 'pg_cron unavailable: skipping purge-old-sms schedule';
  end if;
end $do$;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    -- Digest: daily push at 03:00 UTC, weekly email Sunday 03:30 UTC
    perform cron.schedule('digest-daily', '0 3 * * *', $job$
      select net.http_post(
        url := 'https://gknezlfpalsrqttuxusn.supabase.co/functions/v1/digests',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'X-Cron-Secret', (select secret from cron_config)),
        body := '{"kind":"daily"}'::jsonb)
    $job$);
    perform cron.schedule('digest-weekly', '30 3 * * 0', $job$
      select net.http_post(
        url := 'https://gknezlfpalsrqttuxusn.supabase.co/functions/v1/digests',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'X-Cron-Secret', (select secret from cron_config)),
        body := '{"kind":"weekly"}'::jsonb)
    $job$);
  else
    raise notice 'pg_cron/pg_net unavailable: skipping digest schedules';
  end if;
end $do$;
