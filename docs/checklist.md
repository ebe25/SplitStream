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
- [X] GitHub repo + first commit
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
- [x] OAuth: GitHub + Google sign-in (Font Awesome brand icons), providers enabled in dashboard, `0002_profile_names.sql` pushed (real names from OAuth metadata)
- [ ] Replace placeholder icons (solid squares) with real ones
- [ ] Deploy to Vercel + add URL in Supabase Auth → URL Configuration
- [ ] Acceptance: two phones, invite → expense → identical simplified debts → settlement zeroes; installs to Android home screen
- [ ] RLS tests in CI

## Phase 1 — Capture pipeline — CODE DONE + DEPLOYED
- [x] `0003_capture.sql`: `devices`, `raw_sms`, `transactions`, `review_items` (owner-only RLS) — docker-validated, **pushed to cloud**
- [x] pgTAP tests for capture tables (`supabase/tests/0003_capture_test.sql`)
- [x] Device tokens: mint in Settings (32-byte base64url, shown once, SHA-256 hex stored), revoke with confirm
- [x] `ingest-sms` Edge Function — **deployed** (`--no-verify-jwt --use-api`); 401 on bad token verified live; dedupe via unique index; parser inline
- [x] SMS parser in `packages/shared`: 8 templates (HDFC/ICICI/SBI/Axis, UPI/card/NEFT), 14 fixtures in `fixtures/sms/corpus.json`, 21 Vitest tests green
- [x] Review inbox screen + tab (Personal w/ category, Group → prefilled split editor, Ignore, parse-failure dismiss)
- [x] `pnpm sync:functions` copies parser into functions `_shared/` (bundler can't reach outside `supabase/functions/`)
- [ ] MacroDroid recipe on phone (steps in README) + mint a device token in Settings
- [ ] Acceptance: coffee → inbox in seconds; dupes no-op; garbled SMS = parse failure, not silence

## Phase 2 — Routing engine + push — CODE DONE, not deployed (per dev-testing hold)
- [x] Decision tree locked via grilling: VPA-first member match + learned payee_identities; auto if 1 shared group, review if 2+; member credits → review, other credits → ignore; pending_split visible w/ badge; push actions deep-link
- [x] `0004_routing.sql`: `rules`, `payee_identities`, `push_subscriptions`, `review_items.payload` + widened kinds, `confirm_expense_split()` RPC — docker-validated + pgTAP (`0004_routing_test.sql`)
- [x] `route(txn, ctx)` pure function in `packages/shared` — every branch tested (19 tests; 40 total green)
- [x] Routing wired inline into `ingest-sms` (buildContext + applyAction; no separate parse-run — YAGNI)
- [x] Web Push: VAPID keys generated (public in `.env`, private in gitignored `supabase/functions/.env`), `_shared/push.ts` sender (auto-prunes dead subscriptions), custom SW (injectManifest) with push + notificationclick deep-link
- [x] Learning loop: "Always do this" checkbox → `rules` upsert; Rules CRUD + Notifications enable in Settings
- [x] Split prompt: `pending_split` inbox item (one-tap Equal via RPC, Custom → `/group/:id/split/:eid` editor), amber badge in group ledger
- [x] Deployed 2026-07-20: 0004 pushed (local=remote 0001–0004), `ingest-sms` redeployed with routing, VAPID secrets set (3), 401 auth-reject verified live
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
- [x] CI: `.github/workflows/ci.yml` — shared tests + web build + `supabase test db` (pgTAP/RLS as release blocker)
- [x] Root scripts: `pnpm test` / `test:db` / `build` / `sync:functions` — documented in README
- [ ] Playwright two-user flow
