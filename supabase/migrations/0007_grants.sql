-- Explicit table grants. Cloud (db push, runs as postgres) gets these via
-- default privileges; local/CI (db reset, runs as supabase_admin) does NOT —
-- tables created by supabase_admin carry no grants, so RLS tests died on
-- "permission denied" before ever exercising a policy. Make grants explicit
-- so every environment matches, and RLS remains the only line of defense.

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

-- cron_config holds the cron shared secret: no client role may ever read it,
-- grants or not. RLS-without-policies already hides rows; revoke makes it loud.
revoke all on table public.cron_config from anon, authenticated;
