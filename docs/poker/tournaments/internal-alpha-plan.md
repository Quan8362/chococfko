# Poker Tournament — Internal-Alpha (fully playable) implementation plan

Status: **IN PROGRESS (E3A).** Goal: make tournaments genuinely playable end-to-end for internal
Closed-Beta users only, fully dark by default, with tournament chips isolated from wallets. Built
incrementally in four sub-phases (E3A-1 … E3A-4). Each phase stops and reports; nothing pushes or
deploys until every phase and its tests pass.

This plan sits under the canonical specs in `docs/poker/tournaments/` and does **not** override them.
Authority rules: `engine-specification.md`. Balancing: `table-balancing.md`. Payout:
`payout-policy.md`. State machine: `state-machine.md`.

## 0. Non-negotiable invariants (enforced every phase)

- **Dark by default.** `POKER_TOURNAMENT_INTERNAL_ALPHA` defaults OFF (fail-closed). The public
  `tournament` flag stays hard-off and untouched. Flag OFF ⇒ no route, no nav, no action, for anyone
  incl. admins.
- **Internal Closed Beta only.** Visible only via `pokerTournamentInternalAlphaVisible` = poker
  visible (admin, or Closed-Beta member when `closedBeta` runs) AND the internal-alpha flag ON.
- **Operator = admin, server-authorized.** create / start / transition / settle require
  `pokerTournamentCanOperate` (admin) in the server action AND the DB grants (`admin_transition` /
  `settle` are `service_role`-only). Participants (register / unregister) need visibility only.
- **Chips ≠ coins (TNMT-CHIP-002).** Tournament chips live in `poker_tournament_entries.chips` and
  the new `poker_tournament_seats.stack`. In-tournament hands move chips **within** the tournament
  and **never** write `game_wallets` / `coin_ledger`. Wallet crossings happen exactly twice per
  entry: entry-fee debit at register (done), prize/refund credit at settle/unregister (done).
- **Once-only.** register / unregister-refund / elimination / completion / payout are each idempotent
  (idempotency-key txn rows + natural unique keys), re-enforced in SQL under row locks.
- **Reuse, don't fork (TNMT-ENG-010).** The individual hand is played by the existing pure cash
  engine (`lib/games/poker/engine.ts`, `hand.ts`, `betting.ts`, `pot.ts`, `showdown.ts`) unchanged.
  The tournament layer supplies blinds and consumes the settled result; it never reimplements
  betting / evaluation / side-pots / showdown.
- **No production SQL this phase.** New DB objects are authored as an **unapplied** migration
  (`migration_poker_tournament_orchestration.sql`) validated on a local/staging DB, then applied via
  a separate controlled migration phase (the 27G-E2 pattern). The already-applied
  `migration_poker_tournament.sql` is never reapplied.

## 1. Architecture

```
Browser (intents + render only)
      │  server actions ('use server')
      ▼
app/games/poker/tournaments/*      ← routes (list, [id], create) — gated server-side
app/games/poker/tournament-actions.ts  ← register/unregister (cookie client) ; create/start/
                                          transition/settle/advance/seat (admin client)
      │
      ├─ lib/games/poker/tournament/*  (PURE): stateMachine, blinds, registration, prizePool,
      │     payout, elimination, balancing, config, + NEW handChips (chip settlement adapter)
      │
      ▼
DB (authoritative): existing poker_tournament_* (applied) + NEW orchestration objects (unapplied):
   poker_tournament_seats      — one row per seated entry at a live tournament table (stack in chips)
   poker_tournament_hands      — tournament-scoped hand state (mirrors poker_hand_state, wallet-free)
   RPCs (SECURITY DEFINER, service_role-only, idempotent, audited, NEVER touch wallets/ledger):
     poker_tournament_seat_draw(tid)          — deterministic seeded initial seating → seats+entries
     poker_tournament_advance_level(tid)      — resolve level from elapsed/paused_ms; write current
     poker_tournament_start_hand(tid,table)   — open a hand over a table's seats at current blinds
     poker_tournament_apply_hand(tid,hand,Δ)  — apply settled chip deltas to seats/entries (conserve)
     poker_tournament_eliminate(tid)          — bust detection (chips==0) → ELIMINATED + place, audit
     poker_tournament_balance(tid)            — break/move to keep max-min ≤1 (pending at boundary)
     poker_tournament_settle(...)             — EXISTS (applied): pay from real finishing places
```

Why a tournament-scoped hand table instead of the cash `poker_hands`/`poker_settle_hand`: the cash
settle path credits `game_wallets`/`coin_ledger` on cash-out and is bound to `poker_tables` lifecycle
(sit/top-up/stand). A tournament hand must settle to `poker_tournament_seats.stack` only. We reuse the
**pure** engine for all hand logic and persist chip deltas through the wallet-free tournament RPCs.

## 2. Data model additions (unapplied migration — E3A-2)

- `poker_tournament_seats(id, tournament_id, entry_id, table_no, seat_index, stack bigint>=0, state,
  updated_at)` — UNIQUE(tournament_id, table_no, seat_index); UNIQUE(entry_id). RLS: public read;
  REVOKE writes; DEFINER RPCs only. Chip conservation asserted vs `starting_stack * entries_granted`.
- `poker_tournament_hands(id, tournament_id, table_no, level_index, sb, bb, ante, state jsonb,
  action_seq, started_at, settled_at)` — the wallet-free hand-state row. RLS public read of
  non-hole-card projection (hole cards stay server-side, mirroring cash-engine privacy).
- Rollback file drops only the new objects. A local `poker_tournament_orchestration_tests.sql`
  harness mirrors `poker_tournament_tests.sql` (conservation, once-only, wallet-untouched assertions).

## 3. Sub-phases & exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **E3A-1** | Architecture + this plan + fail-closed flag/gate foundation | ✅ flag defaults OFF; gate helpers + tests pass; tsc clean. **(this phase)** |
| **E3A-2** | Orchestration migration (seats + tournament hands + RPCs, unapplied) + pure `handChips` adapter + local DB harness | RPCs authored + statically reviewed; pure adapter unit-tested (conservation, elimination, once-only); DB harness green **on a local/staging DB** (requires DB — see §4). |
| **E3A-3** | Routes (list/[id]/create), `tournament-actions.ts`, operator controls, participant flow, UI, i18n ×5 | routes 404 when flag OFF / non-allowlisted; register→play→standings render; i18n parity green; build green. |
| **E3A-4** | E2E (auth, realtime, seating, elimination, settlement), security + economy + wallet/ledger regression, release validation | full end-to-end playthrough green; wallet/ledger untouched by hands; payout/refund once; champion + paid states correct. |

## 4. Known blocker (environment)

DB-level validation of E3A-2+ requires a Postgres to apply the **unapplied** orchestration migration
and run the SQL harness + economy/wallet/ledger tests. This workstation currently has **no Supabase
CLI and no Docker**, and production SQL is forbidden this phase. To proceed past E3A-2's DB gate we
need one of: (a) local Supabase (WSL2+Docker, as used for the 28B foundation validation), or (b) a
disposable staging Supabase project. Pure-TS layers (engine adapter, gate, actions logic) are fully
unit-testable without it; only the DB/E2E gates are blocked until a DB is available.

## 5. Release plan (deferred to end of E3A-4)

Two-plus focused commits (hardening already landed as `4c10ae2`). Flag
`POKER_TOURNAMENT_INTERNAL_ALPHA` stays **unset (OFF)** in production; internal alpha is enabled by
setting it truthy for a Vercel Preview / a controlled window with `POKER_CLOSED_BETA_ENABLED=1` and
the internal cohort populated. Kill switch: unset the flag (surface goes dark instantly on next
request; no data touched). Rollback: unset flag; if the orchestration migration was applied, run its
rollback file. Orchestration migration is applied via a separate controlled phase, never in a build.
