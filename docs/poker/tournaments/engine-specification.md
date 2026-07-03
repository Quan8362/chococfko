# Poker Tournament Engine — Specification (canonical rule IDs)

Status: **FOUNDATION.** Defines the authoritative tournament domain that sits **beside** — never
inside — the cash-game rules engine. The cash-hand engine (`lib/games/poker/engine.ts`, `hand.ts`,
`betting.ts`, `pot.ts`, `showdown.ts`) is reused **unchanged** to play the individual hands; the
tournament layer owns everything *around* the hand: registration, chips, blind schedule, table
balancing, elimination order, and payout.

> **Do not treat a tournament as a cash table with rising blinds.** A cash seat can buy in, top up,
> and cash out at will; a tournament seat cannot. Chips are isolated, the field shrinks, players are
> reseated, and finishing places drive coin payouts. Those are tournament-only concerns and live
> only in `lib/games/poker/tournament/`.

## 0. Authority & purity boundary

- **TNMT-ENG-001** The **server + database are the only authoritative source** of tournament state:
  registration, chip stacks, current level, table assignment, elimination order, prize pool, and
  payouts. The browser sends *intents* and *renders* state; it decides nothing.
- **TNMT-ENG-002** `lib/games/poker/tournament/*` is a **pure** domain library: no React, no
  Supabase, no `process.env`, no wall-clock reads. Every function is a deterministic transform of
  its inputs, unit-testable in isolation. It mirrors the existing pure-engine convention.
- **TNMT-ENG-003** All coin and chip math is **integer** (COIN-INT-001). Entry fees, prize pool,
  payouts, blinds, antes, and chip stacks are integers. No floating point in any settlement path.
  Percentages in a payout structure are stored as integer basis points / weights and divided with
  integer division; remainders are distributed by a frozen rule, never rounded.
- **TNMT-ENG-004** Every state-changing tournament command is executed by a **SECURITY DEFINER RPC**
  with row locks and is **idempotent** (dedup by an idempotency key or a natural unique constraint).
  A retried registration, payout, or refund never double-charges or double-pays.
- **TNMT-ENG-005** Every important transition (register, seat, level-up, move, eliminate, pay,
  cancel) writes an **immutable audit row** so the tournament can be reconstructed and replayed.

## 1. Domain modules (pure library)

| Module | Responsibility | Rule IDs |
|---|---|---|
| `types.ts` | Tournament & player states, config, structures, snapshots | TNMT-STATE, TNMT-PSTATE |
| `stateMachine.ts` | Legal tournament- and player-state transitions | TNMT-STATE |
| `blinds.ts` | Blind structure, level-at-elapsed, next level, time remaining | TNMT-BLIND |
| `registration.ts` | Registration eligibility, dedup keys, open/close, min/max | TNMT-REG |
| `prizePool.ts` | Prize-pool total, payout-place count, per-place shares | TNMT-PAY |
| `payout.ts` | Final settlement rows, ties, remainders, idempotency, conservation | TNMT-PAY |
| `balancing.ts` | Seat draw, table balancing, breaking, final-table, heads-up | TNMT-BAL |
| `elimination.ts` | Elimination order, simultaneous rule, finishing places | TNMT-ELIM |
| `index.ts` | Barrel re-export | — |

## 2. Chips vs coins (TNMT-CHIP)

- **TNMT-CHIP-001** A tournament **entry** deducts the entry fee from the wallet (a coin sink → prize
  pool escrow) and credits the fixed **starting stack** in tournament chips to the entry.
- **TNMT-CHIP-002** Tournament chips live in `poker_tournament_entries.chips` (and per-seat in
  `poker_tournament_seats`). They are **never** written to `game_wallets` / `coin_ledger`. There is
  no RPC that converts chips → coins.
- **TNMT-CHIP-003** Chips are conserved: `sum(entry.chips for live entries) + chips_on_tables ==
  starting_stack * entries_granted`. A hand played on a tournament table moves chips **within** the
  tournament only.
- **TNMT-CHIP-004** A busted entry's chips are **0**; there is no cash-out path for them. The only
  coin a player can ever receive back is a **prize** (TNMT-PAY) or a **refund** (TNMT-CANCEL).

## 3. Blind schedule authority (TNMT-BLIND)

- **TNMT-BLIND-010** A tournament stores `started_at`, an ordered `levels[]` structure, and an
  accumulated `paused_ms` (time spent paused / on break). The **current level** is a pure function of
  `elapsed = now - started_at - paused_ms` against the cumulative level durations. The server writes
  the resolved level; the client only displays it.
- **TNMT-BLIND-011** Breaks are modelled as pseudo-levels (`isBreak: true`) with a duration and no
  blinds; while a break level is current, no hands start.
- **TNMT-BLIND-012** Pausing the tournament freezes the level clock by accumulating into `paused_ms`;
  resuming continues from the same elapsed level position (pause-safe, reconnect-safe).
- **TNMT-BLIND-013** Blind level applies to a hand at the moment the hand **starts**. A level change
  never alters an in-progress hand's blinds (matches cash-engine hand immutability).

## 4. Table balancing authority (TNMT-BAL)

See table-balancing.md for the full algorithm. Summary rules:

- **TNMT-BAL-010** Initial seating is a **deterministic** draw seeded by the tournament id + a stored
  seed, so it is auditable and replayable (no `Math.random()` in the pure layer).
- **TNMT-BAL-011** Balancing never moves a player who is **in an active hand**; moves are queued as
  **pending** and applied at the next hand boundary for that player's table.
- **TNMT-BAL-012** Balancing minimises the max-min table-size difference to ≤ 1, always breaking the
  **shortest** table first and filling the **most-empty** seats.
- **TNMT-BAL-013** A moved player is dropped into a seat chosen to preserve **blind fairness** (never
  a seat that lets a player skip paying a blind they are due, and never forcing a double blind beyond
  policy) per the frozen rule in table-balancing.md.

## 5. Elimination authority (TNMT-ELIM)

- **TNMT-ELIM-010** Elimination is decided only after the cash-hand engine reports a **fully settled**
  hand (main + all side pots resolved). A player with `chips == 0` at that point is eliminated.
- **TNMT-ELIM-011** The finishing place of eliminated players is assigned from the current number of
  remaining players downward, using the tie-break in TNMT-ELIM-003 for same-hand knockouts.
- **TNMT-ELIM-012** Elimination order is **append-only** and audited; it is the sole input to payout
  place assignment.

## 6. Payout authority (TNMT-PAY)

See payout-policy.md. Summary:

- **TNMT-PAY-010** Prize pool = `sum(fees collected)` (+ overlay, if a guarantee applies).
- **TNMT-PAY-011** The number of paid places and per-place shares come from the frozen **payout
  structure** attached to the tournament, scaled to the actual field size by a documented rule.
- **TNMT-PAY-012** Settlement produces one payout row per paid finishing place; the sum of payouts
  **exactly equals** the prize pool (conservation, POT-CONSERVE parity). This is asserted in tests.
- **TNMT-PAY-013** Payout is idempotent: keyed by `(tournament_id, entry_id)`; a retried settlement
  moves no additional coins.

## 7. Reuse, don't fork

- **TNMT-ENG-010** The individual hand is played by the **existing** cash engine. The tournament layer
  supplies blind/ante for the hand and consumes the settled result; it does not reimplement betting,
  evaluation, side-pot, or showdown logic.
- **TNMT-ENG-011** Shared coin helpers (`lib/games/shared/coins.ts`), id helpers
  (`lib/games/shared/ids.ts`), and deadline helpers are reused. No new coin-math primitives.
