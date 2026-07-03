# Poker Tournament — Cancellation Policy (frozen)

Cancellation must never invent an ad-hoc result. Exactly one of the policies below applies, chosen by
the tournament's state at cancel time. Every branch is **idempotent**, **conserving** (coins out ==
coins in), and **fully audited**. Refunds and partial payouts reuse the settlement machinery in
payout-policy.md.

## 1. Cancel BEFORE start (TNMT-CANCEL-001)

Applicable states: `DRAFT`, `SCHEDULED`, `REGISTRATION_OPEN`, `STARTING` (before the first hand is
dealt).

- **TNMT-CANCEL-010** Every entry (and re-entry, though re-entry is impossible pre-start) is refunded
  its **full** entry fee. Refund amount per user = `sum(entryFee paid)`.
- **TNMT-CANCEL-011** This includes the **minimum-not-met** auto-cancel: if the field is below the
  minimum at the scheduled start, the tournament auto-transitions to `CANCELLED` and full refunds
  are issued (TNMT-REG-005).
- **TNMT-CANCEL-012** Refunds are idempotent, keyed `refund:tournament_id:entry_id`; a retried cancel
  refunds nothing extra. Conservation: `sum(refunds) == sum(fees collected)`.

## 2. Cancel AFTER start (TNMT-CANCEL-002)

Applicable states: `RUNNING`, `BREAK`, `FINAL_TABLE`, or a `PAUSED_FOR_REVIEW` that paused from one
of those. Play has begun, so a full refund would over-pay (chips already changed hands). The frozen
policy is **chip-proportional equity with a floor**:

- **TNMT-CANCEL-020 (proportional equity).** The **effective prize pool** is distributed to all
  **still-live** entries in proportion to their **current tournament chips**:
  `payout_i = floor(pool * chips_i / totalChipsInPlay)`.
- **TNMT-CANCEL-021 (already-eliminated players).** Players already **in the money** at cancel time
  keep the prize their finishing place had already locked in; that locked amount is removed from the
  pool **before** the proportional split among live players. Players eliminated **out of the money**
  receive nothing (they had already busted under normal rules).
- **TNMT-CANCEL-022 (remainder).** Any integer-division remainder after the proportional split is
  distributed one coin at a time from the **largest current stack** downward (frozen, deterministic;
  tie-break by lower entry id). Guarantees `sum(all payouts + locked prizes) == pool`.
- **TNMT-CANCEL-023 (single live player).** If cancellation leaves exactly one live player, they are
  treated as the winner for the remaining (unlocked) pool.

## 3. Guarantees & overlay at cancel

- **TNMT-CANCEL-030** If a `guaranteedPrizePool` applies, the **effective pool** used by §1/§2 is
  `max(collectedFees, guaranteedPrizePool)`; a pre-start cancel with a guarantee still refunds only
  **fees** (no overlay is owed when no play occurred). Post-start, the guarantee counts toward the
  effective pool distributed proportionally.

## 4. PAUSED_FOR_REVIEW → cancel

- **TNMT-CANCEL-040** A tournament paused for integrity review may be cancelled. The policy is chosen
  by the state it **paused from** (pre-start → §1, live → §2), not by the paused state itself, so an
  integrity hold never changes the refund a player was owed.

## 5. Audit & evidence (TNMT-CANCEL-050)

- Every cancel writes an immutable audit row: `reason`, `policy_applied` (`pre_start_full_refund` |
  `post_start_proportional`), `pool`, `locked_prizes`, `actor` (admin id or `system` for auto), and
  the full per-entry payout/refund breakdown. The pre-cancel table/stack state is preserved so the
  decision is reviewable and replayable.

## 6. Non-negotiables

- **TNMT-CANCEL-060** Never destroy or strand coins: `coins refunded/paid == coins escrowed`.
- **TNMT-CANCEL-061** Never double-refund or double-pay (idempotency keys on every row).
- **TNMT-CANCEL-062** Never invent a policy not listed here. A state with no branch above (only the
  two terminals `COMPLETED`/`CANCELLED`) cannot be cancelled again — the RPC rejects it.
