# 0001 — The money's recipient is the settlement confirmer

Date: 2026-07-20
Status: accepted

## Context

Settlements change balances — they erase debt. Someone must vouch for them.
Options considered: (a) anyone records, instantly confirmed (v0 behavior);
(b) every settlement needs the other party's confirmation; (c) asymmetric:
payer-side records are pending, recipient-side records are confirmed.

(a) lets a payer unilaterally erase a debt they never paid. (b) makes a
recipient confirm their own receipt — a pointless second tap that trains
users to ignore confirmations.

## Decision

Asymmetric trust (c): receiving is confirmation. A settlement recorded or
auto-detected on the payer's side ("I paid", debit-SMS match) starts
`pending` and awaits the recipient. One recorded or auto-detected on the
recipient's side (cash receipt entry, credit-SMS match, inbox
member-credit action) is `confirmed` immediately. Only confirmed
settlements affect balances.

## Consequences

- The v0 "Record paid" flow (payer creates confirmed) is replaced; the
  payer path always produces pending.
- An incoming credit that matches a pending settlement confirms it rather
  than creating a duplicate.
- A recipient who falsely records a receipt only hurts themselves (erases
  money owed to them), so no counter-confirmation is needed.
