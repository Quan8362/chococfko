# Poker Controlled Refunds

The **only** sanctioned way to move coins to correct an incident. There is no "edit balance"
button, and there never will be — a refund is an idempotent, audited, incident-tied database
operation.

**Core rule:** no arbitrary direct balance editing. Every correction flows through
`poker_admin_refund_hand`, which wraps the proven, idempotent `poker_refund_hand` and writes a
`poker_admin_audit` row. A duplicated admin click never double-refunds (settlement lock).

## The RPC

```
poker_admin_refund_hand(p_actor uuid, p_hand_id uuid, p_reason text, p_case_id uuid DEFAULT NULL)
```

- **`p_reason` is required** (raises `reason_required` if blank) — it is the audit reason.
- Calls `poker_refund_hand(p_hand_id)` — **idempotent** via the settlement lock, so a repeated call
  returns the same result and moves coins at most once.
- Writes a `poker_admin_audit` row (actor, `refund_hand`, reason, table, hand, case, result JSON).
- If `p_case_id` is supplied, advances that `poker_incident_cases` row to **`REFUNDED`** (only path
  to that state) and stamps `closed_by`/`closed_at`.
- Runs `SECURITY DEFINER`, service-role only. It is invoked from an admin server action, never from
  the browser.

## Eligibility — a refund is only correct when

1. An **incident case exists** (`poker_incident_cases`) and is `OPEN`/`INVESTIGATING`.
2. The hand genuinely failed conservation or settlement — confirmed by the integrity checker
   (`CONSERVATION_MISMATCH`, `POT_CONSTRUCTION_MISMATCH`, `SETTLEMENT_RECONCILE_MISMATCH`,
   `DUPLICATE_SETTLEMENT`, `LEDGER_IMBALANCE`) and/or the hand replay.
3. The hand is not going to settle correctly on its own (typically already **frozen** via
   `poker_admin_freeze_hand` → `PAUSED_FOR_REVIEW`).

If any of these is not true, do **not** refund — investigate first.

## Workflow

```
1. Incident       open poker_incident_cases (poker_admin_open_incident); classify SEV.
2. Freeze         poker_admin_freeze_hand(actor, hand, reason)  → stops further mutation.
3. Identify       who is affected + the hand(s). Confirm from poker_hand_settlements +
                  poker_actions replay (/admin/poker/hands/[handId]).
4. Verify ledger  read the ORIGINAL coin_ledger + game_wallets rows. Establish the pre-incident
                  truth BEFORE any correction (checkLedgerConservation as evidence).
5. Preview        state the proposed correction in the case note: which seats, how many xu, why.
                  The refund returns escrowed contributions to their contributors — a defined,
                  reconstructable amount, not a judgement call.
6. Approve        a second admin reviews the preview note (four-eyes for SEV-1). Record approval.
7. Execute        poker_admin_refund_hand(actor, hand, reason, case_id).  ← idempotent
8. Verify result  re-run the integrity check: money-out (payouts+refunds) == money-in
                  (total contributed); wallet == starting + ledger delta. Case auto-moves REFUNDED.
9. Communicate    user message (support template) + case note. Lift wind-down when safe.
```

## Idempotency & safety guarantees

- **At-most-once coin movement:** `poker_refund_hand` is guarded by the settlement lock; calling it
  twice for the same hand does not double-pay. Safe to retry after a timeout.
- **Immutable ledger:** the refund appends `coin_ledger` entries; it never rewrites history.
- **Audit reason mandatory:** blank reason is rejected at the RPC.
- **Case coupling:** passing `p_case_id` ties the coin movement to the incident and advances it to
  `REFUNDED`, so the audit trail is complete end-to-end.
- **No manual edits:** there is no supported path to `UPDATE game_wallets SET balance = …` by hand.
  If you think you need one, you have found a gap — escalate, don't improvise.

## Verification (must pass before closing)

Using `lib/games/poker/coinIntegrity.ts` semantics:

- `checkHandCoinIntegrity`: `sum(contributions) == declaredPotTotal`, and
  `sum(payouts) + sum(refunds) == authoritativeTotalContributed`, and `settlementRowCount <= 1`.
- `checkLedgerConservation` per affected wallet: `currentBalance == startingBalance + ledgerDelta`,
  and `currentBalance >= 0`.
- The 15-min cron `GET /api/cron/poker-integrity` should report clean on the next run.

If verification fails, the incident stays open — do not mark it resolved.

## Drill

Rehearse this end-to-end on staging before you ever need it in prod — see
[staging-drills.md](./staging-drills.md) → "Controlled refund".

## Related

- [incident-response.md](./incident-response.md) · [runbooks/coin-conservation-failure.md](./runbooks/coin-conservation-failure.md)
  · [runbooks/duplicate-settlement.md](./runbooks/duplicate-settlement.md) · [runbooks/settlement-failure.md](./runbooks/settlement-failure.md)
  · [runbooks/frozen-hand.md](./runbooks/frozen-hand.md)
