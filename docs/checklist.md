# SplitStream — Progress Checklist

_Last updated: 2026-07-24_

## 0. Setup & repo layout — DONE (except publish)
- [x] Monorepo layout (`apps/web`, `packages/shared`, `supabase/`, `forwarder-android/`, `fixtures/sms/`)
- [x] pnpm workspaces (`package.json`, `pnpm-workspace.yaml`)
- [x] git init + `.gitignore` (`.env` committed, `.env.local` ignored)
- [x] README (local + docker start-up, cloud setup)
- [x] Supabase CLI installed (2.109.1)
- [x] Supabase cloud project created + linked (ref `gknezlfpalsrqttuxusn`)
- [x] `apps/web/.env.local` filled with cloud URL + anon key
- [X] GitHub repo + first commit
- [x] `supabase init` (config.toml — needed only for local stack / `supabase test db`)
- [x] Vercel project

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
- [x] Replace placeholder icons (solid squares) with real ones (pine ₹ mark, Phase 4)
- [x] Deploy to Vercel (https://split-stream-web.vercel.app) + site URL set in Supabase Auth
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

## Phase 3 — Smart settlements — CODE DONE, not deployed
- [x] Grilled + documented: CONTEXT.md glossary, ADR-0001 (recipient confirms; payer-side = pending, recipient-side = confirmed)
- [x] UPI deep-link buttons (hidden when member has no VPA) + "I paid ✓" (pending, deduped vs SMS matcher)
- [x] Settlement matcher in `route()` — exact match, 0% tolerance, debit + credit sides (47 tests green)
- [x] Credit mirror: incoming match confirms existing pending, else creates confirmed
- [x] Counterpart confirmation UI (recipient Confirm button; payer sees "awaiting confirmation")
- [x] Lifecycle: `0005_settlements.sql` guard trigger (closed immutable, close requires zero nets) + UI card (any member; docker-validated + pgTAP)
- [x] Bug fixed: `simplified_debts()` raised under service role — member check now applies only to real user sessions (validated both paths)
- [x] Deployed 2026-07-20: 0005 pushed (local=remote 0001–0005), `ingest-sms` redeployed with matcher, 401 auth-reject verified live
- [ ] Acceptance: pay via UPI → settled-pending auto; one-tap confirm

## Phase 4 — Hardening & reach — CODE DONE, deploy on Vedansh
- [x] Grilled + documented: QR pairing, APK sideload via PWA button, dual-channel digests (CONTEXT.md updated)
- [x] Kotlin forwarder (`forwarder-android/`): QR/paste pairing → EncryptedSharedPreferences, sender whitelist, SMS_RECEIVED → WorkManager POST (Doze-safe, retries), delivery log — NOT compiled (no JDK/Android SDK on this machine; `./gradlew assembleDebug` on a machine with JDK 17 + SDK 34)
- [x] PWA: device-token QR in Settings + "Get the forwarder" APK download button (expects GitHub release asset `splitstream-forwarder.apk`)
- [x] `0006_hardening.sql`: `purge_old_sms()` (30-day retention; failed SMS kept while review open), dedupe index, `cron_config`, guarded pg_cron/pg_net schedules — docker-validated + pgTAP
- [x] Dedupe tuning in ingest: equal amount+direction within ±2 min = duplicate alert, no second transaction
- [x] `digests` edge function: daily push + weekly Resend email, X-Cron-Secret auth
- [x] Root `pnpm deploy` script added
- [x] Deployed 2026-07-23: 0006 pushed, both functions live, secrets set, cron_config updated, daily+weekly smoke-tested (script renamed `pnpm ship` — `pnpm deploy` is a pnpm builtin)
- [x] Run-logs infra: `pnpm logs` → `logs/<timestamp>/` (git, migrations, function logs, tests, versions) + project CLAUDE.md conventions
- [x] Email provider: Maileroo (Vedansh's pick, account created) — digests swapped to `smtp.maileroo.com/api/v2/emails`, `EMAIL_API_KEY` secret set, function redeployed; key verified live (auth OK)
- [x] `DIGEST_FROM` set (`digest@65cbf34d9a709eba.maileroo.org`) — real email delivered end-to-end ✓
- [x] Real PWA icon: pine gradient ₹-with-stream mark (512 + 192), replaces placeholder squares
- [x] PWA install prompt: `beforeinstallprompt` banner above tab bar + Settings "Install app" card (iOS Share→Add-to-Home-Screen hint; dismiss persisted)
- [x] APK release automation: `.github/workflows/release-apk.yml` (tag `forwarder-v*` or manual run → builds + attaches `splitstream-forwarder.apk` to a GitHub release) + `docs/forwarder-release.md` guide
- [x] Build + publish forwarder APK (JDK 17 + Android SDK machine → GitHub Releases as `splitstream-forwarder.apk`)
- [x] UI/UX revamp (frontend-design plugin): "banyan & marigold" — deep ₹-note green + marigold-for-pending palette as Tailwind v4 tokens, Anek Latin display font, `Money` component (Indian grouping, tabular nums), deliberate light/dark modes, auth + onboarding hero treatment; 47 tests + build green
- [x] Fix login OTP email (2026-07-24): magic-link template had no `{{ .Token }}` (link only) + OTP length was 8 vs UI's 6 + built-in mailer throttled at 2/hr — patched via management API: custom SMTP → Maileroo (`splitstream@…maileroo.org`), template/subject now carry the code, length 6; test OTP sent 200 ✓
- [x] Fix SPA refresh 404 on Vercel (2026-07-24): `apps/web/vercel.json` with rewrite → `/index.html` (commit + redeploy on Vedansh)
- [x] Auth mascot (2026-07-24): pointer-tracking "friends" mascot shipped — two pine faces + marigold ₹ coin with flowing stream dashes; hover/tap splits the coin into chips flying to each friend; eyes + 3D tilt follow cursor/touch, spring pop-in, idle float + blink (reduced-motion respected). Code-built in motion after grill (Rive runtime skipped); alternate split-coin concept kept as `MascotSplitCoin` in anim.tsx — one-word swap in auth.tsx to compare
- [x] Motion pass (2026-07-24): `motion` + `lottie-react` added — `src/anim.tsx` (Lottie pine-arc `Loading` replacing 5 text states, `PageFade` route transitions keyed on pathname + reduced-motion respected, `Confetti` burst); GroupDetail celebrations on settlement confirm/record + transition-to-settled banner, spring layout anims on settle-up/settlement rows, whileTap on pay buttons; favicon + apple-touch-icon linked in index.html; 47 tests + build green, auth page verified in browser

## Phase 5 — Capture resilience: multi-VPA + UPI-app notifications (ADR 0002)
- [x] Bug root-caused (2026-07-24): ICICI SMS unparsed — sender gate `ICICIB` missed `AD-ICICIT-S`, counterparty regex missed multi-word names; retry blocked by `raw_sms_user_dedupe`
- [x] Parser: sender gating removed (body format = bank fingerprint), multi-word counterparty; real SMS added to fixtures (48 tests green) — deployed `ce1510a`
- [x] Reliability: ingest marks `parsed` only after ledger work (crash ⇒ resumable `pending`); shared pipeline extracted to `_shared/pipeline.ts`
- [x] `reprocess` sweep (table-as-queue): re-parse stuck pending/failed, re-route traceless unrouted txns; hourly pg_cron (`0008`), `pnpm reprocess` manual trigger — deployed + verified live (stuck ₹10 row healed)
- [x] Deep research (adversarially verified, 2026-07-24): NPCI handle→provider→bank map (65 rows), Jun-2026 volume ranking, API-access verdict (none exists — merchant-scoped only); notification formats UNVERIFIABLE from web — must capture real samples
- [x] ADR 0002 written: SMS primary + notifications secondary via forwarder NotificationListenerService, body-format-only matching, multi-VPA, static suffix map
- [x] `0009_user_vpas.sql`: `user_vpas` table (owner RLS + pgTAP, 40 db tests green), backfill from `profiles.upi_vpa` — applied locally, cloud push pending (`raw_sms.source` deferred to notification step)
- [x] Post-login UPI gate (`RequireVpa` in `vpas.tsx`): first login blocks on adding ≥1 UPI ID (skippable, persisted); shared `VpaEditor` chips UI also replaces the single-VPA field in Settings; `profiles.upi_vpa` auto-syncs to oldest VPA (pay links unchanged)
- [x] `buildContext` unions co-member VPAs from `user_vpas` with legacy `profiles.upi_vpa` — settlement matching sees every registered VPA
- [ ] `vpaProviders.ts` in `packages/shared`: suffix→provider map from ADR 0002 + lookup; unknown-suffix ⇒ review item
- [ ] Forwarder: `NotificationListenerService` + package whitelist (GPay/PhonePe/Paytm), capture mode (forward raw title+text as `source: 'app_notification'`)
- [ ] Notification templates from captured samples (`fixtures/notifications/corpus.json`) → `pnpm reprocess` heals capture backlog
- [ ] Acceptance: pay via GPay on a bank whose SMS template we lack → transaction still lands (notification path); second VPA settlement match works

### Parked (revisit once real usage exists)
- [ ] CSV export (per-group + personal)
- [ ] Category budgets + monthly personal report
- [ ] Expense comments
- [ ] Custom send domain (before inviting housemates): login-code + digest emails spam-folder because sender is Maileroo sandbox subdomain (`65cbf34d9a709eba.maileroo.org` — SPF/DKIM/DMARC all pass, zero domain reputation). Fix: buy domain → verify in Maileroo → repoint `smtp_admin_email` + `DIGEST_FROM`. Interim: "Not spam" once trains own inbox

## Cross-cutting
- [x] SQL tests for RLS + balance functions (written; run via `supabase test db` after `supabase init`)
- [x] Vitest on shared money math
- [x] CI: `.github/workflows/ci.yml` — shared tests + web build + `supabase test db` (pgTAP/RLS as release blocker)
- [x] Root scripts: `pnpm test` / `test:db` / `build` / `sync:functions` — documented in README
- [ ] Playwright two-user flow
