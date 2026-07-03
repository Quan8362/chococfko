# Runbook — Cash-Out Failure (stack stuck at table)

**Severity:** SEV-2 · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [settlement-failure.md](./settlement-failure.md), [coin-conservation-failure.md](./coin-conservation-failure.md), [../refunds.md](../refunds.md)

> ⚠️ **Illustrative SQL.** The queries in this runbook use bind-style placeholders (e.g. `:hand_id`) and column names implied by each table's purpose. They are **not verified against the production schema** — confirm columns before use, run reads only, and **never** execute write/DDL against production. See [../reporting.md](../reporting.md) (support-tools) and [../incident-response.md](../incident-response.md).

## Symptoms
- Player leaves the table but coins are not returned to their `game_wallets`; stack appears stuck.
- "Cash out" / "leave table" spins or errors.
- `poker_ops_events` kind `failed_action` or `settlement_failure` on a leave/close path.

## Detect / Confirm
- Compare seat stack vs wallet vs ledger:
  ```sql
  select seat, stack from poker_seats where table_id = :table_id;
  select balance from game_wallets where user_id = :user_id;      -- shared play-money wallet
  select amount, created_at from coin_ledger where user_id = :user_id order by created_at desc limit 20;
  ```
- Confirm no live hand is blocking the cash-out:
  ```sql
  select id, phase from poker_hands where table_id = :table_id
    and phase not in ('COMPLETED','CANCELLED');
  ```
- Recall: `poker_admin_close_table` refuses while a live hand is in progress — the table must settle/refund first. A pending hand is the most common "stuck stack" cause.

## Immediate action (stop the bleeding)
1. If a live hand is in progress, let it settle (or resolve per [stuck-hand.md](./stuck-hand.md) / [frozen-hand.md](./frozen-hand.md)). Do NOT credit the wallet manually.
2. If the table is in closing state, drive the authoritative path — `poker_resolve_closing` runs on the server; do not bypass it.
3. Open an incident case if coins are genuinely missing from the ledger: `poker_admin_open_incident(...)`.

## Diagnose (root cause)
- Determine which layer diverged: seat stack updated but wallet not credited (ledger write failed), or neither moved (cash-out never ran).
- Replay `coin_ledger` for the user around leave time; look for a missing return entry.
- Check `poker_admin_audit` for a partial `poker_admin_close_table` / force-sit-out.
- If seat stack + ledger disagree in a way that breaks conservation → escalate to [coin-conservation-failure.md](./coin-conservation-failure.md).

## Recover
1. Re-drive the cash-out through the authoritative close/settle path once the live hand is resolved. Never hand-edit `game_wallets` or `poker_seats`.
2. To close a stuck table cleanly: settle/refund any live hand, then `poker_admin_mark_closing` → `poker_admin_close_table` (refuses if a hand is still live).
3. If a coin correction is required, use the idempotent, audited, incident-tied refund — see [../refunds.md](../refunds.md).

## Verify
- Seat removed / table closed; `game_wallets.balance` reflects the returned stack; `coin_ledger` has the matching return entry.
- Coin conservation holds (no coins created/destroyed); integrity dashboard clean.

## Communicate
- Reassure the player their balance is server-authoritative and safe; correct via the incident once diagnosed.
- Note resolution in the incident case.

## Post-incident
- Close `poker_incident_cases` `RESOLVED` with a note (or terminal `REFUNDED`). Preserve ledger + seat evidence. File follow-up if the close/cash-out path failed structurally.
