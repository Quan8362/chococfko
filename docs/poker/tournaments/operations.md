# Poker Tournament — Operations

Audience: admins/ops. Covers the admin surface, the release process, and the DEFINER-RPC command
list. Every command is authorized (admin-only) and audited.

## 1. Feature flag & rollout

- **Flag:** `POKER_TOURNAMENT_ENABLED` (`flags.tournament`). Currently **HARD OFF** in
  `lib/games/poker/flags.ts` (`tournament: false`, unaffected by env — enforced by
  `FLAG-HARDOFF-001`). The tournament foundation is built but reachable by nobody.
- **Release step (future):** after the exit criteria in test-plan.md §4 pass, change `tournament`
  from the hard `false` to `truthy(env[POKER_FLAG_ENV.tournament])` (the `practiceBots` pattern) and
  add a `pokerTournamentsOn(flags, viewer)` gate. It stays OFF in prod until ops sets the env var.
- **Never** flip the flag while any tournament test or the release audit is red.

## 2. Admin command surface (planned, next phase)

All under `/admin/poker/tournaments` behind the existing admin gate + poker-admin audit. Each maps to
one SECURITY DEFINER RPC (see §4). None are wired to a player route yet.

| Command | RPC | Notes |
|---|---|---|
| Create draft | `poker_tournament_create_draft` | Author config, blind structure, payout structure |
| Schedule | `poker_tournament_schedule` | Set start time → `SCHEDULED` |
| Open registration | `poker_tournament_open_registration` | → `REGISTRATION_OPEN` |
| Start | `poker_tournament_start` | Seat draw + first hands → `STARTING`/`RUNNING` |
| Pause / resume | `poker_tournament_pause` / `_resume` | → `PAUSED_FOR_REVIEW` and back |
| Cancel | `poker_tournament_cancel` | Applies cancellation-policy.md |
| Advance level (manual) | `poker_tournament_advance_level` | Ops override; normally automatic |
| Inspect tables/balancing | (read RPC / views) | Read-only |
| Inspect payouts | (read RPC / views) | Read-only projected + settled |
| Settle | `poker_tournament_settle` | Idempotent final payout |

## 3. Player command surface (planned, next phase)

| Command | RPC | Idempotency |
|---|---|---|
| Register | `poker_tournament_register` | key `reg:tournament:user` (+ re-entry seq) |
| Cancel registration | `poker_tournament_unregister` | pre-start only; full refund |
| Re-enter | `poker_tournament_reenter` | key `reentry:tournament:user:seq` |
| Post action in a hand | reuse cash `poker_commit_action` | per-hand idempotency (existing) |

## 4. RPC authority model

- Every mutating RPC is `SECURITY DEFINER SET search_path = public`, takes `FOR UPDATE` row locks on
  the tournament + affected entries/seats, validates the state transition (TNMT-STATE), and writes an
  audit row. Clients have **no direct write** to any `poker_tournament_*` table (RLS + REVOKE).
- Coin movement (fee escrow, prize credit, refund) happens **only** inside these RPCs, via the shared
  wallet debit/credit with a `coin_ledger` row and an idempotency key. Chips never touch the wallet.
- Reads: players may read public tournament state (lobby, structure, standings, their own entry) via
  RLS-guarded views. Hole cards on tournament tables obey the **same** privacy rules as cash
  (private-only, never in a public/shared payload).

## 5. Disconnect / time-out ops (TNMT-DC)

- The blind clock and hand timers are server-authoritative; a disconnected player is auto-folded/
  checked by the existing cash turn-timer path. Ops does not need to intervene per-player.
- A whole-tournament technical incident → `poker_tournament_pause` (freezes the level clock via
  `paused_ms`), investigate, then `_resume` or `_cancel`.

## 6. Release audit checklist (dedicated)

Before enabling the flag, a reviewer signs off, in writing, that:

1. **Idempotency** — register / re-enter / settle / refund each proven no-double under retry (DB
   harness `TT-*-IDEM`).
2. **Coin integrity** — fee escrow + prize/refund conserve exactly; chips never reach a wallet;
   `coin_ledger` balanced (`coinIntegrity` parity).
3. **Privacy** — no hole cards in any tournament public/realtime/spectator payload.
4. **Authority** — no client write path to any `poker_tournament_*` table; every RPC state-validates.
5. **Cancellation** — pre-start and post-start branches both conserve and audit; no ad-hoc path.
6. **Isolation** — enabling tournaments changes nothing about cash tables or TLMN/Caro; migrations
   are additive + reversible (rollback file present).

## 7. Migrations

- `supabase/migration_poker_tournament.sql` — additive tables + DEFINER RPCs + RLS. **PENDING** (not
  applied to prod). Apply on an isolated DB first, run `poker_tournament_tests.sql`, then apply to
  prod during the release, after the existing poker migrations.
- `supabase/migration_poker_tournament_rollback.sql` — drops only the objects this migration adds.
- Touches **no** existing table's data; adds new `poker_tournament_*` objects only.
- **Apply identity:** run as `supabase_admin` (the owner of `coin_ledger`). Applying as raw
  `postgres` fails with `must be owner of table coin_ledger` because §0 widens the shared reason
  CHECK. In the Supabase SQL editor / prod path this is automatic.
- **Validated (Prompt 28B):** apply + idempotent re-apply + harness (`ALL ASSERTIONS PASSED`) +
  rollback all verified on an isolated local Supabase (PG 17.6). See test-plan.md §3b.

### 7a. Exact PENDING production step (still manual, not done)

The migration is **committed but NOT applied to production.** When the tournament release is
approved, an admin runs, in the Supabase SQL editor for the prod project, **after** the existing
poker migrations:

```
-- 1) apply
\i migration_poker_tournament.sql          -- (paste contents; runs as supabase_admin)
-- 2) validate on an isolated copy first (never prod): \i poker_tournament_tests.sql
```

Do not apply it to prod until the dedicated tournament release audit (§6) signs off.

## 8. Known limitations (foundation phase)

- Player UI, admin UI, TS server actions, and realtime wiring are **not** built yet (next phase). The
  pure engine, schema, RPC definitions, specs, and tests are.
- Overlay/guarantee funding is calculated + audited but not wired to a live faucet.
- Bounty/PKO, satellites, shootout, and multi-day formats are out of scope for the foundation.
