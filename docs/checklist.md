# SplitStream — Progress Checklist

_Last updated: 2026-07-19_

## 0. Setup & repo layout — DONE (except publish)
- [x] Monorepo layout (`apps/web`, `packages/shared`, `supabase/`, `forwarder-android/`, `fixtures/sms/`)
- [x] pnpm workspaces (`package.json`, `pnpm-workspace.yaml`)
- [x] git init + `.gitignore` (`.env` committed, `.env.local` ignored)
- [x] README (local + docker start-up, cloud setup)
- [x] Supabase CLI installed (2.109.1)
- [x] Supabase cloud project created + linked (ref `gknezlfpalsrqttuxusn`)
- [x] `apps/web/.env.local` filled with cloud URL + anon key
- [ ] GitHub repo + first commit
- [ ] `supabase init` (config.toml — needed only for local stack / `supabase test db`)
- [ ] Vercel project

## Phase 0 — Ledger core — CODE DONE, deploy pending
- [x] `0001_ledger.sql`: 7 ledger tables, auth→profile trigger, deferred split-sum constraint
- [x] RLS on all tables (owner-only personal, membership-join group) + pgTAP suite (`supabase/tests/0001_ledger_test.sql`)
- [x] `group_balances()` + `simplified_debts()` (greedy min-transaction) in SQL
- [x] `invite_code` + `join_group()` SECURITY DEFINER
- [x] `create_group_expense()` RPC — expense + splits in one transaction
- [x] Validated on real Postgres (docker): RLS isolation, split rejection, balances, settlement zeroing, RPC path
- [x] **Migration pushed to cloud** (`supabase db push`, verified local 0001 = remote 0001)
- [x] PWA scaffold: Vite + React + TS, supabase-js, email-OTP auth, auth guard
- [x] Screens: Auth → Groups → Group detail (balances, settle-up, expenses, settlements) → Expense form (equal/exact/percent/shares) → Personal → Settings → `/join/:code`
- [x] `computeSplits()` paise-exact math in `packages/shared` — 7 Vitest tests green
- [x] Tailwind v4, minimalist zinc+indigo theme, dark-mode toggle (system default, persisted, no flash)
- [x] Onboarding: empty Groups state = 3-step welcome (name → first group → invites)
- [x] Design audit (vercel web-design-guidelines skill): touch-action, focus-visible, labels/autocomplete, theme-color sync
- [x] vite-plugin-pwa: manifest + service worker + icons; production build green
- [ ] Replace placeholder icons (solid squares) with real ones
- [ ] Deploy to Vercel + add URL in Supabase Auth → URL Configuration
- [ ] Acceptance: two phones, invite → expense → identical simplified debts → settlement zeroes; installs to Android home screen
- [ ] RLS tests in CI

## Phase 1 — Capture pipeline
- [ ] `0002_capture.sql`: `devices`, `raw_sms`, `transactions`, `review_items` (owner-only RLS)
- [ ] Device tokens (mint in Settings, show once, store SHA-256 hash)
- [ ] `ingest-sms` Edge Function (token auth, idempotency index)
- [ ] SMS parser in `packages/shared` + `fixtures/sms/` corpus + Vitest
- [ ] Review inbox screen (assign to Personal / group / Ignore)
- [ ] MacroDroid recipe on phone
- [ ] Acceptance: coffee → inbox in seconds; dupes no-op; garbled SMS = parse failure, not silence

## Phase 2 — Routing engine + push
- [ ] `0003_routing.sql`: `rules`, `payee_identities`, `push_subscriptions`
- [ ] `route(txn, context)` pure function, every branch unit-tested
- [ ] `parse-run` wiring (route + apply in transaction)
- [ ] Web Push: VAPID keys, `notify` function, actionable notifications
- [ ] Learning loop: `resolve-review` + "always do this" → rules; rules CRUD in Settings
- [ ] Split prompt: `pending_split` + one-tap Equal
- [ ] Acceptance: known merchant silent; housemate VPA → group asking split; unknown = exactly one notification; "always" learns

## Phase 3 — Smart settlements
- [ ] UPI deep-link buttons (`upi://pay?...`)
- [ ] Settlement matcher (exact match only at launch)
- [ ] Credit mirror (incoming ≈ owed → settlement confirmed)
- [ ] Counterpart confirmation UI
- [ ] Lifecycle gates in UI (SQL triggers already live)
- [ ] Acceptance: pay via UPI → settled-pending auto; one-tap confirm

## Phase 4 — Hardening & reach
- [ ] Kotlin forwarder (WorkManager)
- [ ] raw-SMS retention (pg_cron, 30 days)
- [ ] Dedupe tuning (bank+UPI double alerts)
- [ ] Digests; budgets/reports/comments/CSV once real usage exists

## Cross-cutting
- [x] SQL tests for RLS + balance functions (written; run via `supabase test db` after `supabase init`)
- [x] Vitest on shared money math
- [ ] CI (RLS tests + Vitest on every push)
- [ ] Playwright two-user flow
