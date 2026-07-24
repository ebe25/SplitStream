# splitstream

Expense-splitting app: pnpm monorepo (PWA in `apps/`, shared parser/route in `packages/shared`) + Supabase backend (project ref `gknezlfpalsrqttuxusn`).

## Commands

- `pnpm test` — Vitest across workspace
- `pnpm test:db` — pgTAP suite (needs `supabase start`)
- `pnpm build` — typecheck + build the PWA
- `pnpm sync:functions` — copy parser/route into `supabase/functions/_shared/`
- `pnpm ship` — db push + sync + deploy edge functions
- `pnpm logs` — snapshot debugging context into `logs/<timestamp>/`
- `pnpm reprocess` — manually trigger the cloud reprocess sweep (re-parse stuck SMS, re-route stuck transactions); run after shipping a parser fix

## Debugging convention

Run `pnpm logs` first when debugging — snapshots git/migrations/function-logs/tests into `logs/<timestamp>/`. Read the latest folder before re-discovering state.

## Things agents keep re-learning

- Edge function deploys need `--use-api` — local docker bundling is broken on this machine.
- It's `pnpm ship`, not `pnpm deploy` — `deploy` collides with a pnpm builtin.
- Parser and route live in `packages/shared` and are COPIED to `supabase/functions/_shared/` via `pnpm sync:functions`. Edit the source, then sync — never edit the copies.
- Migrations are validated on a throwaway docker `postgres:16` with an auth-schema stub.
- Secrets: `supabase/functions/.env` (gitignored) for local, `supabase secrets set` for cloud.
- The cron job reads its secret from the `cron_config` table, not env.
