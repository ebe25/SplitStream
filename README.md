# SplitStream

Splitwise-style shared expenses + automatic bank-SMS transaction capture, built on Supabase + a React PWA. All four planned phases are implemented and deployed (see `docs/checklist.md` for live status, `docs/implementation-plan.md` for the original plan, `CONTEXT.md` for the domain glossary).

```
apps/web/            React 18 + Vite + Tailwind v4 PWA (auth, groups, splits, inbox, push)
packages/shared/     pure functions: computeSplits, SMS parser, routing engine (47 Vitest tests)
supabase/migrations/ 0001–0007: ledger, profiles, capture, routing, settlements, hardening, grants
supabase/tests/      pgTAP suite (36 tests) — RLS failures are release blockers
supabase/functions/  ingest-sms (capture + routing), digests (push/email summaries)
forwarder-android/   Kotlin SMS forwarder (QR pairing, WorkManager) — released via GitHub Actions
fixtures/sms/        redacted bank SMS corpus driving the parser tests
docs/                checklist (status), implementation plan, ADRs, forwarder release guide
```

## What's implemented

- **Ledger core (Phase 0)** — groups with invite links, expenses with equal/exact/percent/shares splits (paise-exact math), balances + greedy simplified debts computed in SQL, settlements, owner-only + membership RLS on every table.
- **Auth** — email OTP plus Google & GitHub OAuth; profiles auto-created with OAuth names.
- **Capture (Phase 1)** — device tokens (minted in Settings, QR-pairable, SHA-256 stored, revocable), `ingest-sms` edge function with idempotent dedupe, template-based parser for HDFC/ICICI/SBI/Axis UPI/card/NEFT formats, review inbox for anything unrouted, parse failures surface instead of vanishing.
- **Routing engine (Phase 2)** — pure decision tree: member-VPA match (self-declared or learned), auto-route to a single shared group, one push on genuine ambiguity, merchant rules with an "always do this" learning loop, pending-split expenses with one-tap equal split, web push via VAPID + custom service worker.
- **Smart settlements (Phase 3)** — UPI deep links, exact-match settlement detection on both debit and credit sides, "I paid" with dedupe, recipient-confirms trust model (ADR-0001), group lifecycle (active → settling → closed) enforced in SQL.
- **Hardening (Phase 4)** — Kotlin forwarder (QR pairing, Doze-safe WorkManager delivery, delivery log) released as a sideloadable APK from the app itself, 30-day raw-SMS retention via pg_cron, bank+UPI duplicate-alert dedupe (±2 min window), daily push + weekly email digests (Maileroo), PWA install prompt, run-logs tooling.

## The Android user story

1. **Land & install.** Open an invite link → sign in with Google (or email OTP) → you're in the group. An install banner offers "Install SplitStream"; two taps later it's an app on the home screen with push notifications.
2. **First-run.** Settings: display name, your UPI VPA (this is what lets housemates' payments to you auto-route), enable notifications.
3. **Auto-capture (optional, Android-only).** Settings → *Get the forwarder* → install the APK → *Add device* in Settings shows a one-time QR → scan it from the forwarder. Bank SMS now flow in automatically. Skipping this is fine — everything works manually, and iOS users always use manual entry (Apple blocks SMS access).
4. **Daily life.** Known merchants log silently to a category; a payment to a housemate's VPA lands in your shared group asking only how to split; an unknown merchant costs exactly one notification, and ticking "always do this" makes the next one silent. A normal day is zero or one notification.
5. **Settle up.** The group screen suggests minimal transfers: *Pay via UPI* opens GPay pre-filled → *I paid ✓* records it pending (or your debit SMS records it for you — deduped) → the recipient confirms with one tap → balances zero. Cash works the same way via *Record received*.
6. **No-forwarder housemates** just log expenses by hand, Splitwise-style — same balances, same settle-up, same digests.

## Prerequisites

- Node 20+, pnpm 9 (`corepack enable`)
- Docker Desktop (the local Supabase stack runs in containers)
- Supabase CLI: `brew install supabase/tap/supabase`

## Local start-up

```sh
supabase start     # full local stack; prints API URL + anon key
# copy the printed anon key into apps/web/.env (VITE_SUPABASE_ANON_KEY)
supabase db reset  # apply migrations 0001–0007
supabase test db   # pgTAP suite (36 tests)
pnpm install
pnpm --filter web dev
```

`supabase stop` shuts the containers down. Local Studio: http://127.0.0.1:54323

## Cloud setup

1. Create a project at https://supabase.com/dashboard; copy **Project URL** + **anon key** into `apps/web/.env.local` (gitignored).
2. `supabase login && supabase link --project-ref <ref>`
3. `pnpm ship` — db push + deploy both edge functions.
4. Auth: enable Email OTP + Google/GitHub providers; add the deployed site URL under **Authentication → URL Configuration**.
5. Secrets: see Digests below + `VAPID_*` keys for push (`supabase secrets set --env-file supabase/functions/.env`).

Never put the `service_role` key in any client env file — it bypasses RLS. Edge Function secrets only.

## Tests & scripts

- `pnpm test` — Vitest across the workspace (split math + parser + routing engine, 47 tests)
- `pnpm test:db` — pgTAP suite: RLS + money math, the release blockers (36 tests; needs `supabase start`)
- `pnpm build` — typecheck + production build of the PWA
- `pnpm ship` — db push + sync + deploy both edge functions (`--use-api`; local docker bundling is broken on this machine)
- `pnpm sync:functions` — copy parser + routing engine into `supabase/functions/_shared/` (run after editing them, before deploying)
- `pnpm logs` — snapshot debugging context (git state, migrations, last hour of edge-function logs, test run, tool versions) into `logs/<timestamp>/`; run it first when debugging

CI (`.github/workflows/ci.yml`) runs unit tests, the web build, and the pgTAP suite on every push. `release-apk.yml` builds and publishes the forwarder APK on `forwarder-v*` tags — see `docs/forwarder-release.md`.

## SMS ingest

Devices authenticate with `X-Device-Token` (not JWTs); pair via the QR in Settings → Devices.

```sh
curl -X POST https://<ref>.supabase.co/functions/v1/ingest-sms \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: <raw-token-from-settings>' \
  -d '{"sender":"VM-HDFCBK","body":"Rs.450.00 debited from a/c **1234 ...","received_at":"2026-07-19T10:00:00Z"}'
```

The normal client is the Kotlin forwarder (`forwarder-android/`). For quick pipeline tests from any phone without installing anything, a MacroDroid HTTP-POST macro pointed at the same endpoint works too.

## Digests

Daily push + weekly email summaries (see CONTEXT.md "Digest"), scheduled by pg_cron.

Emails go through [Maileroo](https://maileroo.com) (`POST https://smtp.maileroo.com/api/v2/emails`, `X-API-Key` header). The sending key is bound to a domain — find it under **Domains** in the Maileroo dashboard; `DIGEST_FROM` must use that domain.

```sh
supabase secrets set CRON_SECRET=... EMAIL_API_KEY=<maileroo-sending-key> DIGEST_FROM='SplitStream <digest@<your-maileroo-domain>>' APP_URL=https://<your-app>
```

pg_cron reads the secret from the `cron_config` table, so set the same value there:

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
