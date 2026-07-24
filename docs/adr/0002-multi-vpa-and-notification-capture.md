# ADR 0002 — Multi-VPA identity + UPI-app notification capture

Date: 2026-07-24 · Status: accepted (design; implementation pending)

## Context

The 2026-07-24 ICICI incident (`raw_sms_user_dedupe` bug): a real transaction
SMS failed to parse because the sender gate expected `ICICIB` while ICICI's
transactional route uses `AD-ICICIT-S`, and the counterparty regex assumed a
single token while P2P debits carry full names. SMS parsing is inherently
template-brittle; the question was whether to replace it.

Proposal examined: ask users for their UPI IDs (plural), map VPA suffixes to
provider apps, and read those apps' transactions directly.

**Research verdict (deep-research, 2026-07-24, adversarially verified):**

- **No third-party API to UPI-app transaction history exists.** Google Pay's
  only transaction API (Omnichannel "Get Transaction Details") is
  merchant-scoped, invite-only, and returns only the merchant's own orders
  (primary source: developers.google.com/pay/india). No consumer-history API
  found for PhonePe or Paytm either. "Read the app's transactions" is not
  buildable; the on-device signals — SMS and app notifications — are the only
  third-party paths.
- **No verified notification text formats.** Zero claims about exact
  GPay/PhonePe/Paytm notification title/body text survived verification.
  Writing notification templates from guessed formats would recreate the
  ICICI bug — real samples must be captured first.

## Decisions

1. **SMS stays the primary capture channel.** It is regulatory-mandated for
   every debit and carries account tail + bank ref. App notifications become a
   *secondary* signal: they catch transactions whose SMS template we don't
   support yet and carry richer counterparty names, but they can be swiped,
   disabled, or reformatted by any app update.
2. **Notification capture lives in our forwarder** (`forwarder-android/`), as
   a `NotificationListenerService` beside the existing `SmsReceiver`, with a
   package whitelist (GPay/PhonePe/Paytm to start). Same WorkManager retry
   path, same ingest endpoint. No MacroDroid dependency.
3. **Templates match body format only — no sender/package gating for parse.**
   Shipped for SMS in `ce1510a`: DLT sender ids are per-route fragile
   (`AD-ICICIB` vs `AD-ICICIT-S`) and HDFC/SBI bodies never name the bank; the
   body format IS the fingerprint. Notification templates will follow the same
   rule. The phone-side whitelist (sender / package) remains the spam gate.
4. **Notification templates are authored only from real captured samples.**
   Before parsing, the forwarder ships a capture mode: forward whitelisted-app
   notification title+text to ingest, let them land as `parse_failed` review
   items, author templates from those rows, then `pnpm reprocess` heals them.
   (The reprocess sweep from ADR-adjacent work `ce1510a` makes this loop free.)
5. **Users can register multiple UPI IDs.** `profiles.upi_vpa` (single) becomes
   a `user_vpas` table. Uses: settlement matching across a member's every VPA
   (today a co-member paying from their second VPA is missed), and deriving —
   via the suffix map below — which provider apps the forwarder should listen
   to for that user.
6. **The suffix→provider map is static data in `packages/shared`**
   (`vpaProviders.ts`), sourced from NPCI's TPAP register (the only
   comprehensive primary source — Wikipedia carries 4 of 65 handles; PayU's
   integrator table has known errors, e.g. it attributed @yescurie to CRED,
   which actually belongs to Curie Money). Refresh cadence: check the NPCI
   register when a VPA with an unknown suffix shows up (surface as a review
   item, not a silent drop).

## Verified handle → provider → bank map

Source: NPCI TPAP register live API + page, fetched 2026-07-24 (65 handle
rows / 47 apps); cross-checked against provider primary sources. Confidence
high on all rows (12-0 to 15-0 adversarial votes).

| Provider (app) | Handles (@suffix → PSP bank) |
|---|---|
| Google Pay | `okaxis`→Axis, `okhdfcbank`→HDFC, `okicici`→ICICI, `oksbi`→SBI (merchant: `okbizaxis`→Axis) |
| PhonePe | `ybl`→Yes, `ibl`→ICICI, `axl`→Axis; `phonepe` (own PPI wallet) |
| Paytm | `paytm`→Yes (legacy, still live), `ptyes`→Yes, `ptaxis`→Axis, `pthdfc`→HDFC, `ptsbi`→SBI |
| Amazon Pay | `rapl`→RBL, `yapl`→Yes, `apl`→Axis |
| CRED | `axisb`→Axis, `yescred`→Yes (NOT `yescurie` — that is Curie Money) |
| WhatsApp Pay | `waicici`/`icici`→ICICI, `waaxis`→Axis, `wasbi`→SBI, `wahdfcbank`→HDFC |
| Navi | `naviaxis`→Axis, `nyes`→Yes |
| super.money | `superyes`→Yes |
| POP (POPclub) | `yespop`→Yes |
| MobiKwik | `mbkns`→NSDL, `ikwik`→HDFC |
| Jupiter | `jupiteraxis`→Axis |
| Flipkart UPI | `fkaxis`→Axis |
| Groww | `yesg`→Yes |
| Samsung Pay | `pingpay`→Axis |
| BHIM (NPCI) | `upi` |
| Freecharge | `freecharge` |

Notes: Fi Money's `fifederal` was removed from the register in late 2025 —
users may still hold such VPAs (retired handle ≠ dead VPA; keep in map,
flagged legacy). slice is absent from the current register. FamApp by Trio
ranks in the top-8 by volume but its handle wasn't captured — verify against
the register during implementation.

Market share (NPCI, customer-initiated volume, Jun 2026): PhonePe 10,484mn ·
Google Pay 7,408mn · Paytm 1,799mn · Navi 843mn · super.money 430mn · BHIM
224mn · FamApp 195mn · WhatsApp 151mn · CRED 142mn. GPay+PhonePe+Paytm cover
~85% — notification listening for the big three covers nearly everything.

## Design sketch

Schema (migration `0009`):

```sql
create table user_vpas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  vpa text not null,             -- lowercase
  unique (user_id, vpa)
);
-- owner-only RLS, same pattern as payee_identities.
-- profiles.upi_vpa backfilled into user_vpas, kept (deprecated) until UI moves.

alter table raw_sms add column source text not null default 'sms'
  check (source in ('sms', 'app_notification'));
-- sender column holds the app package name for notifications.
```

Pipeline: notifications POST to the same `ingest-sms` endpoint with
`source: 'app_notification'`; everything lands in `raw_sms`, so dedupe, the
review inbox, and the hourly reprocess sweep apply unchanged. The existing
±2-minute equal-amount duplicate window absorbs SMS+notification
double-reports of the same payment (SMS usually wins the race; whichever
arrives second becomes a duplicate-alert no-op).

`buildContext`: co-member VPA map reads `user_vpas` (all rows) instead of
`profiles.upi_vpa` (one); `payee_identities` stays as the manual override
layer.

Forwarder: `NotificationListenerService` + package whitelist in `Prefs`
(user grants notification access in onboarding; permission is a special
Settings toggle, not a runtime dialog). Suffixes of the user's own
`user_vpas` suggest which packages to enable.

## Implementation phases (tracked in docs/checklist.md, Phase 5)

1. Multi-VPA: `0009` migration, `buildContext` change, Settings VPA-list
   editor, `vpaProviders.ts` map + suffix lookup.
2. Notification capture mode: forwarder listener forwards raw
   title+text (no parsing yet); real samples accumulate as `parse_failed`
   review items.
3. Notification templates: authored from captured samples in
   `fixtures/notifications/corpus.json`, same body-format matcher;
   `pnpm reprocess` heals the capture-mode backlog.

## Sources

- NPCI TPAP register: npci.org.in/product/upi/all-members (+ API
  `api/all-members-tab-details?product_name=UPI&tab_name=3rd-party-apps`)
- NPCI app-wise volume stats: npci.org.in/what-we-do/upi/upi-ecosystem-statistics (Jun 2026)
- Google Pay API scoping: developers.google.com/pay/india/api/otherapis/omnichannel/get-transaction-details
- PhonePe multi-bank press release; Amazon UPI FAQ; Yes Bank TPAP PDF
- Full verified report: deep-research run wf_9693386a-879 (2026-07-24)
