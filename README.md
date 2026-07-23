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

## Tests & scripts

- `pnpm test` — Vitest across the workspace (split math + SMS parser, 21 tests)
- `pnpm test:db` — pgTAP suite: RLS + money math, the release blockers (needs `supabase init` once, then `supabase start`)
- `pnpm build` — typecheck + production build of the PWA
- `pnpm sync:functions` — copy the parser into `supabase/functions/_shared/` (run after editing it, before deploying)
- `pnpm logs` — snapshot debugging context (git state, migrations, last hour of edge-function logs, test run, tool versions) into `logs/<timestamp>/`; run it first when debugging so the state is captured once

CI (`.github/workflows/ci.yml`) runs the unit tests, the web build, and the pgTAP suite on every push.

## SMS ingest (Phase 1)

Deploy (devices auth via `X-Device-Token`, not JWTs). The parser is copied from
`packages/shared` — after editing it, run `pnpm sync:functions` before deploying.
`--use-api` because local docker bundling fails on this machine:

```sh
pnpm sync:functions
supabase functions deploy ingest-sms --no-verify-jwt --use-api
```

Test:

```sh
curl -X POST https://<ref>.supabase.co/functions/v1/ingest-sms \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: <raw-token-from-settings>' \
  -d '{"sender":"VM-HDFCBK","body":"Rs.450.00 debited from a/c **1234 ...","received_at":"2026-07-19T10:00:00Z"}'
```

MacroDroid recipe: Trigger **SMS Received** (sender contains your bank sender IDs) → Action **HTTP Request** POST to `https://<ref>.supabase.co/functions/v1/ingest-sms`, header `X-Device-Token: <raw token>`, JSON body `{"sender":"[sms_sender]","body":"[sms_message]","received_at":"[system_time_iso]"}`.

## Digests (Phase 4)

Daily push + weekly email summaries (see CONTEXT.md "Digest"), invoked by pg_cron.

Emails go through [Maileroo](https://maileroo.com) (`POST
https://smtp.maileroo.com/api/v2/emails`, `X-API-Key` header). The sending key
is bound to a domain — find it under **Domains** in the Maileroo dashboard; the
`DIGEST_FROM` address must use that domain.

```sh
supabase functions deploy digests --no-verify-jwt --use-api
supabase secrets set CRON_SECRET=... EMAIL_API_KEY=<maileroo-sending-key> DIGEST_FROM='SplitStream <digest@<your-maileroo-domain>>' APP_URL=https://<your-app>
```

A migration schedules the cron calls; it reads the secret from `cron_config`, so
set the same value there:

```sql
update cron_config set secret = '<same CRON_SECRET>';
```

Test:

```sh
curl -X POST https://<ref>.supabase.co/functions/v1/digests \
  -H 'Content-Type: application/json' \
  -H 'X-Cron-Secret: <CRON_SECRET>' \
  -d '{"kind":"daily"}'
```
