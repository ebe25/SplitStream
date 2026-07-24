-- Phase 5: reprocess sweep — table-as-queue retries for stuck ingest work.
-- raw_sms.parse_status / transactions.routed_status already encode pipeline
-- progress; an hourly cron hits the reprocess function to resume anything a
-- crashed run (or a since-fixed parser gap) left behind.
-- Guarded like 0006: vanilla postgres (CI) has no pg_cron/pg_net.

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('reprocess-hourly', '10 * * * *', $job$
      select net.http_post(
        url := 'https://gknezlfpalsrqttuxusn.supabase.co/functions/v1/reprocess',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'X-Cron-Secret', (select secret from cron_config)),
        body := '{}'::jsonb)
    $job$);
  else
    raise notice 'pg_cron/pg_net unavailable: skipping reprocess schedule';
  end if;
end $do$;
