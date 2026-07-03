# Poker Tournament — Test Plan

Two tiers, mirroring the rest of the poker feature:

- **Pure unit tests** (`node --test lib/games/poker/tournament/**/*.test.ts`) — deterministic, no DB.
  These are shipped in this foundation phase and gate the flag.
- **DB harness** (`supabase/poker_tournament_tests.sql`) — runs the DEFINER RPCs against a throwaway
  branch/local Supabase, asserting idempotency, RLS, conservation, and audit. Shipped as SQL,
  executed in the isolated-DB validation step before any release (never against prod).

## 1. Coverage matrix (requirement → test)

| # | Requirement | Rule ID | Pure test | DB harness |
|---|---|---|---|---|
| 1 | Duplicate registration blocked | TNMT-REG-002 | `registration.test.ts` | `TT-REG-DUP` |
| 2 | Entry-fee idempotency (retry no double-charge) | TNMT-ENG-004 | `registration.test.ts` | `TT-REG-IDEM` |
| 3 | Minimum-player auto-cancel + full refund | TNMT-REG-005 | `registration.test.ts` | `TT-CANCEL-MIN` |
| 4 | Scheduled start / reg window open+close | TNMT-STATE-001 | `stateMachine.test.ts` | `TT-STATE` |
| 5 | Late registration until deadline | TNMT-REG-004 | `registration.test.ts` | `TT-REG-LATE` |
| 6 | Re-entry within window, up to limit | TNMT-REG-006 | `registration.test.ts` | `TT-REENTRY` |
| 7 | Blind level transition by elapsed time | TNMT-BLIND-010 | `blinds.test.ts` | — |
| 8 | Break freezes clock; pause-safe | TNMT-BLIND-011/012 | `blinds.test.ts` | — |
| 9 | Disconnect keeps seat, posts blinds | TNMT-DC-001..004 | `stateMachine.test.ts` | `TT-DC` |
| 10 | Table balancing equalises to ≤1 | TNMT-BAL-024 | `balancing.test.ts` | — |
| 11 | Table breaking (shortest first) | TNMT-BAL-023 | `balancing.test.ts` | — |
| 12 | Final table forms; heads-up | TNMT-BAL-031/032 | `balancing.test.ts` | — |
| 13 | Simultaneous eliminations ordered by start chips | TNMT-ELIM-003 | `elimination.test.ts` | — |
| 14 | Multiple side pots during elimination | TNMT-ELIM-010 | `elimination.test.ts` | `TT-SIDEPOT` |
| 15 | Prize calculation (places + shares + remainder) | TNMT-PAY-011/024 | `prizePool.test.ts` | — |
| 16 | Payout conservation (sum == pool) | TNMT-PAY-012 | `payout.test.ts` | `TT-PAY-CONSERVE` |
| 17 | Duplicate payout (idempotency) | TNMT-PAY-013 | `payout.test.ts` | `TT-PAY-IDEM` |
| 18 | Cancellation pre-start full refund | TNMT-CANCEL-010 | `payout.test.ts` | `TT-CANCEL-PRE` |
| 19 | Cancellation post-start proportional | TNMT-CANCEL-020 | `payout.test.ts` | `TT-CANCEL-POST` |
| 20 | Reconnect resumes authoritative state | TNMT-DC-004 | `stateMachine.test.ts` | `TT-DC` |
| 21 | Full tournament simulation (deterministic) | end-to-end | `simulation.test.ts` | — |

## 2. Property/invariant tests

- **Chip conservation.** Across a simulated tournament, `sum(chips) == starting_stack * entries` at
  every hand boundary (`simulation.test.ts`).
- **Payout conservation.** `sum(payouts) == effectivePool` for random field sizes and random weight
  ladders (`payout.test.ts`, fuzzed with a seeded PRNG).
- **State closure.** Every state's outgoing transitions land in a known state; terminals have none
  (`stateMachine.test.ts`).
- **Balancing convergence.** Repeated balancing from random imbalanced configs converges to a
  `max-min ≤ 1` layout in a bounded number of moves, never moves an in-hand player
  (`balancing.test.ts`).
- **Elimination totality.** Every entry ends in exactly one terminal (WITHDRAWN | PAID | out-of-money
  bust) with a unique finishing place per bust (`elimination.test.ts`).

## 3. Full-simulation test (TNMT #21)

`simulation.test.ts` runs a deterministic N-entry tournament using a seeded PRNG for all-in luck,
driving: seat draw → hands (via a lightweight settlement stub over the real prize/elim/balancing
pure functions) → blind level-ups → balancing → table breaks → final table → heads-up → payout.
Assertions: chip conservation each boundary, exactly `N` entries reach a terminal, finishing places
are `1..N` with no gaps/dupes (ties collapse to shared places), and `sum(payouts) == pool`.

## 3b. Verified results (Prompt 28B — isolated DB validation)

Validated on an **isolated local Supabase stack** (WSL2 + Docker, container `supabase_db_poker-local`,
PostgreSQL 17.6, database `postgres`), applied as the owner role **`supabase_admin`** — the same
identity the Supabase SQL path uses in production (raw `postgres` is intentionally not the owner of
`coin_ledger`). **No production database was touched.**

- **Migration apply:** success. **Re-apply (idempotency):** success — only benign
  `CREATE ... IF NOT EXISTS` skip notices, no errors.
- **Inventory verified:** 6 tables, all expected indexes + unique keys, RLS enabled on all 6, 4
  public-read SELECT policies (`poker_tournament_txn` + `_audit` correctly have **no** policy →
  opaque), 6 RPCs present. Function EXECUTE grants confirmed: `register`/`unregister` →
  `authenticated`; `admin_transition`/`settle` → **`service_role` only** (never `authenticated`).
- **Harness `poker_tournament_tests.sql`:** `ALL ASSERTIONS PASSED` (psql exit 0). Covers
  TT-REG-IDEM (no double-charge, no duplicate row), TT-REG-DUP, TT-CANCEL-PRE (refund exactly once),
  TT-PAY-CONSERVE + TT-PAY-IDEM (retried settle credits nothing extra; sum == pool == 3000),
  TT-PAY-NONCONSERVE (rejected), TT-STATE (illegal transition rejected), TT-RLS (authenticated
  client cannot write). ~12 explicit assertions, all green.
- **Rollback:** removed only tournament objects (0 tournament tables / 0 tournament procs left);
  prerequisite `game_wallets` + `coin_ledger` unchanged. The widened `coin_ledger` reason CHECK is
  intentionally left in place (additive superset — see cancellation/rollback notes).

**Two verified defects fixed during 28B (fixes, not test weakening):**
1. `poker_tournament_prize_pool` now excludes `WITHDRAWN` (pre-start refunded) entries — a refunded
   fee is not part of the pool (TNMT-CANCEL-010).
2. `settle` + `admin_transition` now `GRANT EXECUTE ... TO service_role` — `REVOKE ... FROM PUBLIC`
   had stripped the service-role caller's implicit EXECUTE.

## 4. Exit criteria for flipping the flag

1. All pure tests green (`npm run test:poker` includes the tournament dir).
2. `tsc --noEmit` clean.
3. DB harness green on an isolated Supabase (local or throwaway branch), incl. RLS-deny + conservation.
4. A dedicated **tournament release audit** (operations.md §Release) signs off idempotency, privacy,
   coin-integrity, and cancellation branches.
5. Only then does `POKER_TOURNAMENT_ENABLED` become env-resolved (like `practiceBots`) and default
   OFF in prod.
