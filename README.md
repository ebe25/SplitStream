# SplitStream

Splitwise-style shared expenses + automatic SMS transaction capture. See `docs/implementation-plan.md` for the phase-by-phase build plan.

```
apps/web/            React PWA (Vite + TS) — scaffold pending
packages/shared/     pure functions: parser, routing engine (Phases 1–2)
supabase/migrations/ SQL migrations (0001_ledger.sql = Phase 0 schema, RLS, balance math)
supabase/tests/      pgTAP tests — RLS failures are release blockers
supabase/functions/  Edge Functions (Phase 1+)
forwarder-android/   Kotlin SMS forwarder (Phase 4)
fixtures/sms/        redacted real bank SMS, parser test corpus
```

## Prerequisites

- Node 20+, pnpm 9 (`corepack enable`)
- Docker Desktop (the local Supabase stack runs in containers)
- Supabase CLI: `brew install supabase/tap/supabase`

## Local start-up (Docker under the hood)

```sh
# 1. Start Docker Desktop, then boot the full local stack
#    (Postgres, Auth, API, Studio — all containers):
supabase init      # first time only; generates supabase/config.toml
supabase start     # prints API URL + anon key when ready

# 2. Copy the printed anon key into apps/web/.env (VITE_SUPABASE_ANON_KEY).
#    The URL is already http://127.0.0.1:54321.

# 3. Apply migrations + run the database tests:
supabase db reset  # applies supabase/migrations/ to the local db
supabase test db   # pgTAP suite — RLS + balance math

# 4. Web app (once scaffolded):
pnpm install
pnpm --filter web dev
```

`supabase stop` shuts the containers down; `supabase stop --no-backup` also wipes local data.

Local Studio (DB browser): http://127.0.0.1:54323

## Supabase cloud setup

1. Create a project at https://supabase.com/dashboard (free tier is fine through Phase 3). Pick a region near you; save the database password somewhere safe.
2. Grab credentials: **Project Settings → API** → copy the **Project URL** and the **anon / public key**.
3. Put them in `apps/web/.env.local` (gitignored; overrides `.env`):
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-public-key>
   ```
4. Link the repo and push migrations:
   ```sh
   supabase login                      # opens browser
   supabase link --project-ref <ref>   # <ref> = the id in your project URL
   supabase db push                    # applies supabase/migrations/ to prod
   ```
5. Auth: **Authentication → Providers → Email** — enable Email OTP. Add your deployed site URL under **Authentication → URL Configuration** once the PWA is on Vercel.

Never put the `service_role` key in any client env file — it bypasses RLS. It belongs only in Edge Function secrets (`supabase secrets set`).

## Tests

- `supabase test db` — RLS + money math (release blockers)
- `pnpm test` — Vitest on parser/routing engine, once Phase 1 lands
