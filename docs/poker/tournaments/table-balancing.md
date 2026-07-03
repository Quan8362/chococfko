# Poker Tournament — Table Balancing (frozen algorithm)

All balancing is **deterministic and auditable**: given the same tournament seed and the same set of
live entries + stacks, the pure `balancing.ts` module produces the same seating and the same moves.
No `Math.random()` in the pure layer — randomness comes from a stored `seed` mixed with entry ids
(deterministic PRNG), so a draw can be replayed and verified.

## 1. Table capacity

- **TNMT-BAL-020** A tournament has a fixed `seatsPerTable` (`maxSeatsPerTable`, typically 6 for
  6-max, ≤ 9). The number of tables at start = `ceil(entries / seatsPerTable)`.

## 2. Initial seat draw (TNMT-BAL-010)

- **TNMT-BAL-021** Entries are ordered by entry id, then shuffled by a seeded Fisher–Yates using
  `PRNG(seed)`. The shuffled list is dealt round-robin across tables so table sizes differ by ≤ 1.
- **TNMT-BAL-022** Within a table, players are placed in ascending seat index in draw order. The
  **button** for the first hand is assigned by the frozen rule in engine-rule-specification (reused
  cash-engine button assignment); antes/blinds then follow normal rotation.

## 3. Balancing during play (TNMT-BAL-012)

Runs at every hand boundary, table-by-table, in this order:

1. **TNMT-BAL-023 (break the shortest table).** If the number of tables can be reduced — i.e. the
   total players fit on `tables - 1` tables with ≤ `seatsPerTable` each — the **shortest** table is
   marked **breaking**. Its players are distributed to the other tables, filling the most-empty seats
   first. A breaking table finishes its current hand before its players move.
2. **TNMT-BAL-024 (equalise sizes).** Otherwise, if `maxTableSize - minTableSize >= 2`, move exactly
   enough players from the **largest** table(s) to the **smallest** table(s) to bring the difference
   to ≤ 1. Ties broken by lowest table id (deterministic).
3. **TNMT-BAL-025 (who moves).** The player selected to move from an over-full table is the one who
   is **next to pay the big blind** (the seat furthest from having just paid a blind), so moving them
   costs the field the least blind-fairness distortion. Deterministic tie-break by seat index.

## 4. Blind fairness for a moved player (TNMT-BAL-013)

- **TNMT-BAL-026** A moved player is seated at the destination table in the position that is
  **most-recently-past the big blind** among open seats, so they neither skip a blind they owe nor
  are forced to immediately pay a second blind in the same orbit. If no such seat exists (small
  table), they take the open seat that minimises blinds paid this orbit.
- **TNMT-BAL-027** A moved player never receives cards for a hand already in progress at the
  destination; they join from the next hand there.

## 5. Pending moves & failure recovery

- **TNMT-BAL-028** A computed move is written as a **pending move** row `(entry_id, from_table,
  to_table, to_seat, decided_at)` and applied atomically at the entry's next hand boundary. It is
  **idempotent**: re-applying a pending move that is already applied is a no-op.
- **TNMT-BAL-029** If applying a move fails (destination seat taken by a race), the balancer
  **recomputes** from current authoritative state on the next boundary; a stale pending move is
  discarded, never force-applied. Balancing is therefore self-healing.
- **TNMT-BAL-030** Never move a player who is **in an active hand** (TNMT-BAL-011). The pending row
  waits until that player's table completes the hand.

## 6. Final table & heads-up (TNMT-BAL-003 / 004)

- **TNMT-BAL-031** When remaining players ≤ `seatsPerTable`, all remaining tables collapse into the
  single **final table**. Final-table seating is a fresh seeded redraw (`PRNG(seed, 'final')`) so it
  is auditable; the button is reassigned by the reused cash rule.
- **TNMT-BAL-032** **Heads-up** is the 2-player final. Heads-up blind posting reuses the cash-engine
  heads-up rule (button posts the small blind, acts first preflop, last postflop) — no tournament
  override.
- **TNMT-BAL-033** The tournament ends the instant one player holds **all** chips; that player is 1st.

## 7. Determinism & audit

- **TNMT-BAL-034** Every move and every (re)seating writes an audit row: `event`, `entry_id`,
  `from`, `to`, `level`, `hand_no`, `decided_by` (balancer|admin), `seed_ref`. The full seating at
  any point in time is reconstructable from the audit log + the seed.
