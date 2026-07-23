# SplitStream — Domain Glossary

## Expense
Money one member paid that the group shares. Carries splits that must sum to its amount. A **pending-split expense** exists in the ledger but has no agreed splits yet; it is excluded from balances until the payer splits it.

## Settlement
A transfer between two members that reduces debt — not an expense, never split. A settlement is **pending** until the money's recipient acknowledges it, then **confirmed**. Only confirmed settlements affect balances.

**Confirmation rule:** whoever *receives* the money is the confirmer. A settlement recorded or auto-detected on the payer's side starts pending; one recorded or auto-detected on the recipient's side (receiving is confirmation) is confirmed immediately.

## Debt (simplified)
A suggested transfer from the greedy min-transaction algorithm ("Bob pays Alice ₹500"). A suggestion, not a record — it becomes a settlement when acted on.

## Net
A member's balance in a group: expenses paid minus share owed, adjusted by confirmed settlements. Positive = is owed; negative = owes.

## Settlement matcher
The routing branch that recognizes a bank transaction as a settlement instead of an expense. Matches **exactly** (to the paisa, 0% tolerance) against what the payer owes that member — the net due or a suggested simplified-debt amount. A non-matching payment to a member is an ordinary shared expense, never a partial repayment.

## "I paid"
The payer's manual claim of settlement after a UPI deep-link tap, recorded pending. The SMS matcher and "I paid" dedupe against each other — an equal pending settlement for the same pair, group, and amount is never recorded twice.

## Forwarder
The native Android app whose only job is relaying bank SMS to ingestion. It pairs to an account by scanning the QR of a device token minted in the web app (paste fallback); it is distributed by direct APK download from the web app, never a store. One forwarder = one Device.

## Duplicate alert
The same real-world transaction announced twice (bank SMS + UPI app SMS). Recognized by equal amount and direction within a short window with differing bank references; only the first becomes a transaction.

## Digest
A periodic summary of activity (transactions captured, amounts, items awaiting action). Delivered daily as a push notification and weekly by email.

## Group lifecycle
`active` → accepts expenses and settlements. `settling` → settlements only. `closed` → read-only. Any member may move a group between active and settling (peers, no admin role). Closing requires every member's net to be zero and is irreversible.
