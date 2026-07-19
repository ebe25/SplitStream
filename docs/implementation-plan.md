# SplitStream — Implementation Plan

Companion to `splitstream-architecture.md`. That document says *what* we're building; this one says *in what order, with what tools, and how we know each phase is done.* Each phase ends with acceptance criteria — don't start the next phase until they pass, because every later phase builds on the contracts of the earlier ones.

---

## 0. Setup & repo layout (half a day)

**Accounts and tools:** GitHub repo; Supabase account (free tier is enough through Phase 3); Vercel or Cloudflare Pages for the PWA; Node 20+ with pnpm; Supabase CLI (`supabase init` / `supabase start` gives you a full local stack with Postgres, Auth, and Edge Functions — develop locally, push migrations to prod).

**Monorepo layout** — one repo, so shared types flow between the PWA and Edge Functions:

```
splitstream/
├── apps/web/                  # React PWA (Vite + TypeScript)
├── packages/shared/           # types, zod schemas, parser, routing engine, balance math
├── supabase/
│   ├── migrations/            # 0001_ledger.sql, 0002_capture.sql, 0003_routing.sql ...
│   └── functions/             # ingest-sms/, parse-run/, resolve-review/, notify/
├── forwarder-android/         # Kotlin app (Phase 4 — empty until then)
└── fixtures/sms/              # redacted real bank SMS, the parser's test corpus
```

The single most important structural decision: **the parser and the routing engine live in `packages/shared` as pure functions** with no database access — they take data in and return decisions out. Edge Functions are thin wrappers around them. This is what makes the trickiest logic in the app unit-testable on your laptop with SMS fixtures, instead of debuggable only in production.

---

## Phase 0 — Ledger core (~2 weekends)

*Outcome: a working Splitwise clone with auth, groups, splits, balances, and settlements. No SMS anywhere yet.*

**Step 1 — Schema migration `0001_ledger.sql`.** Only the ledger tables: `profiles`, `groups`, `group_members`, `personal_expenses`, `expenses`, `expense_splits`, `settlements`. Ingestion tables wait for Phase 1 — smaller migrations are easier to reason about and roll back. Add a trigger on `auth.users` insert that creates the `profiles` row, and a check constraint (or trigger) enforcing `SUM(expense_splits.share_amount) = expenses.amount`.

**Step 2 — RLS policies, then RLS tests.** Enable RLS on every table before writing any client code. Two policy families from the architecture doc: owner-only (`user_id = auth.uid()`) on personal tables, membership-join on group tables. Then write SQL tests (pgTAP via `supabase test db`, or a plain script that sets `request.jwt.claims` and asserts row counts) proving user B cannot read user A's personal expenses and a non-member cannot read a group. **This is the "auth-token guarded" requirement made verifiable — treat a failing RLS test as a release blocker forever.**

**Step 3 — Balance math in the database.** A Postgres function `group_balances(group_id)` returning `(user_id, paid, share, net)` and `simplified_debts(group_id)` implementing the greedy min-transaction algorithm (same logic as your prototype widget). Doing this in SQL means the PWA, Edge Functions, and any future client share one implementation and one set of numbers.

**Step 4 — PWA scaffold.** Vite + React + TS in `apps/web`; `supabase-js` client; email-OTP auth; router with an auth guard. Screens in build order: Auth → Groups list → Group detail (ledger, balances, simplified debts, "record settlement") → Expense form with split editor (equal default; exact/percent/shares tabs) → Personal dashboard → Settings. Reuse the visual language from the prototype if you like it — the split-preview "₹1,800 ÷ 4 = ₹450" element carries over directly.

**Step 5 — Invites.** `invite_code` on groups, a `/join/:code` route, and a `join_group(code)` Postgres function (SECURITY DEFINER) so joining doesn't require public read on `groups`.

**Step 6 — Make it a PWA and ship.** `vite-plugin-pwa` for the manifest + service worker (app-shell caching only for now), deploy web to Vercel, link the Supabase prod project, run migrations.

**Acceptance criteria:** two real accounts on two phones can create a group via invite, log an expense with a custom split, see identical simplified-debt suggestions, and record a settlement that zeroes the balance. RLS tests pass. App installs to an Android home screen.

---

## Phase 1 — Capture pipeline (~1 weekend)

*Outcome: a real bank SMS on your phone becomes an unrouted transaction in your review inbox within seconds. Everything still manually assigned.*

**Step 1 — Migration `0002_capture.sql`:** `devices`, `raw_sms`, `transactions`, `review_items` (owner-only RLS on all).

**Step 2 — Device tokens.** PWA Settings screen mints a device: generate 32 random bytes, show once as base64, store only the SHA-256 hash with a label ("MacroDroid – Pixel"). Revocation = delete row.

**Step 3 — `ingest-sms` Edge Function.** Accepts `{sender, body, received_at}` with `X-Device-Token`; verifies hash; idempotency via unique index on `sha256(user_id || body || received_at)`; inserts `raw_sms` with `parse_status='pending'`; invokes the parser inline (simplest correct thing — a queue is premature here).

**Step 4 — Parser in `packages/shared`.** A template registry: `{ senderPattern, regex, extract }` per bank format, producing `{direction, amount, counterparty_raw, account_tail, bank_ref, occurred_at}`. Start by collecting 10–20 real SMS from your own banks into `fixtures/sms/` (redact account numbers), write templates against them, and lock behavior with Vitest. Unmatched SMS → `parse_status='failed'` → a `parse_failed` review item showing the raw text, so unknown formats surface instead of vanishing.

**Step 5 — Review inbox screen.** Lists unrouted transactions + failures; assign to Personal (with category), a group (opens the split editor), or Ignore.

**Step 6 — MacroDroid recipe on your phone.** Trigger: SMS received, sender in your bank list → Action: HTTP POST JSON to the ingest URL with the token header. Ten minutes of setup, and the entire pipeline is live without writing Android code.

**Acceptance criteria:** buy a coffee; the transaction is in your inbox before you've finished it. A duplicate POST creates nothing. A garbled SMS appears as a parse failure, not silence.

---

## Phase 2 — Routing engine + push (~1–2 weekends)

*Outcome: the inbox empties itself. Known merchants auto-log, group-member payees auto-assign, and only genuine ambiguity pings your phone.*

**Step 1 — Migration `0003_routing.sql`:** `rules`, `payee_identities`, `push_subscriptions`.

**Step 2 — Routing engine as a pure function.** `route(txn, context) → Action` in `packages/shared`, where context is `{openGroupsWithNets, payeeIdentities, rules}` and Action is one of `duplicate | settlement | group_expense_pending_split | personal_expense | ignore | review(kind, options)`. Implement the decision tree from architecture §4 exactly, and unit-test every branch — this function is the product.

**Step 3 — Wire it in.** `parse-run` builds the context, calls `route()`, and applies the action in a transaction. `review(...)` actions also call `notify`.

**Step 4 — Web Push.** Generate VAPID keys; PWA subscribes and stores `push_subscriptions`; `notify` Edge Function sends via `web-push`; the service worker's `push` handler shows actionable notifications ("₹450 to NEWMERCHANT — [Personal] [Flat 402] [Ignore]") that deep-link into `resolve-review`.

**Step 5 — Learning loop.** `resolve-review` applies the choice and, when the user ticks "always do this," writes a `rules` row (merchant→category/group) or a `payee_identities` row (VPA→person). Rules CRUD screen in Settings.

**Step 6 — Split prompt.** Auto-assigned group expenses are created `pending_split`; the push offers one-tap Equal or opens the custom split editor — implementing your "ask the split before logging" decision.

**Acceptance criteria:** Zomato logs silently to Food; a payment to a housemate's VPA lands in the flat group asking only for the split; an unknown merchant produces exactly one notification; answering it with "always" means the next identical transaction is silent.

---

## Phase 3 — Smart settlements (~1 weekend)

*Outcome: the full settle-up journey — UPI deep links, auto-detection, confirmation.*

Add **UPI deep-link buttons** next to each simplified debt (`upi://pay?pa=<vpa>&am=<amount>&tn=<group>-settle`). Extend the routing engine's member-payee branch with the **settlement matcher**: exact match against net due or any suggested simplified amount → auto-record settlement `pending`; near-miss within a configurable tolerance (start 0%) → `expense_or_settlement` review item; otherwise expense path. Mirror it on **credits**: incoming payment from a member who owes you ≈ that amount → settlement `confirmed`. Add the counterpart-confirmation UI (recipient confirms pending settlements; manual/cash settlements use the same flow). Enforce the **group lifecycle** gate: `settling` groups accept only settlements; `closed` groups are read-only.

**Acceptance criteria:** tap "Pay Priya ₹730" → pay in your UPI app → return to SplitStream → the debt shows settled-pending without you typing anything; Priya confirms with one tap.

---

## Phase 4 — Hardening & reach (ongoing)

Replace MacroDroid with the **Kotlin forwarder**: `BroadcastReceiver` on `SMS_RECEIVED` → enqueue via WorkManager (survives Doze, retries offline) → POST; UI is just login, sender whitelist, and a delivery log. Add the **raw-SMS retention job** (pg_cron: null out `raw_sms.body` 30 days after successful parse). Tune **dedupe** for bank+UPI double alerts (amount + counterparty + 2-minute window when refs differ). Add WhatsApp/email **digests** (daily summary Edge Function on a schedule). Nice-to-haves once real usage exists: category budgets and monthly personal reports, expense comments, CSV export.

---

## Cross-cutting: testing & risks

**Testing pyramid, cheapest first:** Vitest on parser + routing engine against the fixtures corpus (most of your logic risk lives here); pgTAP/SQL tests for RLS and balance functions (most of your privacy and money-math risk); one Playwright flow for the two-user group journey (most of your regression risk).

**Top risks and their mitigations:** *Bank SMS formats change* → the template registry plus parse-failure review items mean drift degrades to "one manual assignment" instead of silent data loss; add the new fixture, patch the template. *Web Push is flaky on some Android OEMs* → the in-app inbox is the source of truth; push is an accelerator, never the only path. *RLS mistake leaks personal data* → RLS tests in CI, and the service-role key never ships to any client, forwarder included. *MacroDroid gets battery-killed* → acceptable for the MVP; it's exactly why the Kotlin forwarder with WorkManager is the Phase 4 headline. *Settlement tolerance mis-fires* → launch at exact-match only; every widening of tolerance is a deliberate, logged decision.

---

## Definition of done, per phase

| Phase | You can honestly say... |
|---|---|
| 0 | "My housemates and I already use it instead of a spreadsheet." |
| 1 | "My purchases appear in the app before I've pocketed my phone." |
| 2 | "A normal day generates zero or one notification." |
| 3 | "Settling up is one tap plus my UPI PIN." |
| 4 | "It survived a month, a format change, and a phone reboot without babysitting." |
