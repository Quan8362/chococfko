# Poker Tournament — Payout Policy (frozen)

All amounts are **integer coins**. The prize pool is fully distributed — the sum of payouts equals
the prize pool **exactly** (conservation, POT-CONSERVE parity). The browser never computes a payout;
`prizePool.ts` + `payout.ts` compute it purely and the settlement RPC writes it idempotently.

## 1. Prize pool (TNMT-PAY-010)

- **TNMT-PAY-020** `prizePool = sum(entryFee over all granted entries, including re-entries)`. No
  rake this phase → nothing is skimmed.
- **TNMT-PAY-021 (guarantee foundation).** A tournament may carry `guaranteedPrizePool`. The
  **effective** pool is `max(collectedFees, guaranteedPrizePool)`. When the guarantee is larger, the
  difference is an **overlay** funded by the operator faucet as a single audited coin source. This
  phase implements the calculation + audit shape; enabling real overlays is an ops decision.

## 2. Paid places (TNMT-PAY-011)

- **TNMT-PAY-022** The number of paid places scales with field size by a frozen ladder, e.g.:

  | Entries | Paid places (default ladder) |
  |---|---|
  | 2–5 | 1 |
  | 6–9 | 2 |
  | 10–17 | 3 |
  | 18–26 | 4 |
  | 27–35 | 5 |
  | 36–50 | 6–7 |
  | 51+ | ~top 15% |

  The exact ladder is data in the payout structure attached to the tournament, so it is versioned and
  auditable; the table above is the default.

- **TNMT-PAY-023** Each paid place has an integer **weight** (basis points summing to 10000, or raw
  weights). Place `i` receives `floor(pool * weight_i / totalWeight)`.

## 3. Remainder distribution (TNMT-PAY-012)

- **TNMT-PAY-024** After integer division, any leftover coins (`pool - sum(floors)`) are distributed
  **one coin at a time from the highest-paying place downward** until exhausted. This is the frozen
  rule; it guarantees `sum(payouts) == pool` with no rounding loss and favours higher finishes for
  the odd chip (mirrors POT-ODD "by position, never by rounding").

## 4. Ties — same-hand knockouts (TNMT-PAY-005 / TNMT-ELIM-003)

- **TNMT-PAY-025** When two or more players bust in the **same hand**, they are ranked by chips **at
  the start of that hand** (more chips → higher place). Equal starting chips → a **true tie**.
- **TNMT-PAY-026** Truly-tied players occupy a contiguous block of places (e.g. two players tie for
  4th place the block is places 4 and 5). Their combined prize = `sum(prize[place] for places in the
  block)`. Split by integer division across the tied players; the odd-coin remainder is awarded to
  the tied player with the **lower entry id** (frozen deterministic rule — no randomness, no
  suit/position ambiguity since they are equal by every game metric).
- **TNMT-PAY-027** A tie can never pay out more than the block's combined prize; conservation holds.

## 5. Settlement (TNMT-PAY-012 / 013)

- **TNMT-PAY-028** Settlement runs once, when the tournament reaches a winner (`COMPLETED`). It emits
  one payout row per paid **entry** (an entry, not a user — a re-entrant could theoretically cash a
  later entry). Each row: `entry_id`, `user_id`, `place`, `amount`, `idempotency_key =
  tournament_id:entry_id`.
- **TNMT-PAY-029** Coins are credited to `game_wallets` via the shared credit RPC inside the
  settlement DEFINER function, writing a `coin_ledger` row per payout with a tournament reason code.
  A retried settlement (same idempotency key) credits **nothing** additional.
- **TNMT-PAY-030** `payout.ts` asserts `sum(amount) == effectivePool` before the RPC is allowed to
  write; a mismatch is a hard error (never silently settle a non-conserving pool).

## 6. Cancellation payouts

Cancellation refunds/partial payouts are governed by cancellation-policy.md, but they reuse the same
idempotent, conserving, audited settlement machinery (a refund is a payout row with `place = null`
and a refund reason code).

## 7. What the browser may do

Display projected payouts (it can run the same pure functions for preview), show the "bubble", and
show each player's guaranteed min cash. It never writes a payout — settlement is server-only.
