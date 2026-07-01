# Poker — Production Migration Dependency Order (VERIFIED)

**Determined:** 2026-07-01, by static inspection of every poker SQL file in `web/supabase/` plus cross-file dependency grep (not from prior reports, which gave inconsistent counts).
**Status:** Order verified from source. **Do NOT apply to production in this task.** Live apply-on-branch verification was **blocked this session** by Supabase preview-branch provisioning failure (see the final review report); the same stack was validated live on a healthy branch in the prior QA phase (`reports/poker-qa-validation-2026-07-01.md`).

---

## 1. Complete poker SQL inventory (14 files) + classification

| # | File | Class | Notes |
|---|---|---|---|
| 1 | `migration_tlmn_run7_economy.sql` | **PREREQUISITE** | Creates `game_wallets`, `coin_ledger`, `round_settlements` + wallet RPCs. Already in prod (TLMN Run 7 shipped). Poker economy/lifecycle read/alter these. |
| 2 | `migration_poker_core.sql` | **PRODUCTION** (1) | Public game-state: `poker_tables/seats/hands/actions/members`. |
| 3 | `migration_poker_private.sql` | **PRODUCTION** (2) | Secret state: `poker_hole_cards` (RLS read-own), `poker_deck` (no policy), settlements, incidents. |
| 4 | `migration_poker_economy.sql` | **PRODUCTION** (3) | Coin escrow/settlement DEFINER RPCs. **Alters `coin_ledger` reason CHECK** + reads `game_wallets`. |
| 5 | `migration_poker_lifecycle.sql` | **PRODUCTION** (4) | Table settings, seat lifecycle, top-up, closure RPCs. |
| 6 | `migration_poker_engine.sql` | **PRODUCTION** (5) | Atomic start/commit/pause CAS RPCs + `poker_hand_state`. |
| 7 | `migration_poker_admin_ops.sql` | **PRODUCTION** (6) | Admin audit/incident/restriction/ops-event objects + admin RPCs. |
| 8 | `migration_poker_social.sql` | **PRODUCTION** (7) | `poker_player_reports/blocks`. Degrade-safe; needs only core. |
| 9 | `migration_poker_rollback.sql` | **ROLLBACK-ONLY** | Drops poker_* objects; restores `coin_ledger` reason CHECK. **NEVER run as a migration.** |
| 10 | `migration_poker_admin_ops_rollback.sql` | **ROLLBACK-ONLY** | Drops only admin-ops objects. **NEVER run as a migration.** |
| 11 | `poker_db_tests.sql` | **TEST HARNESS** | RLS/privacy + coin integrity (A/B series). Runs in one txn, ROLLBACK. |
| 12 | `poker_lifecycle_tests.sql` | **TEST HARNESS** | Seat lifecycle (L1–L15). |
| 13 | `poker_engine_tests.sql` | **TEST HARNESS** | Engine CAS/idempotency (E1–E8). |
| 14 | `poker_admin_ops_tests.sql` | **TEST HARNESS** | Admin/ops (AO1–AO10). |
| 15 | `poker_full_hand_conservation_test.sql` | **TEST HARNESS** | Full 3-player hand session-conservation. |

**Obsolete/superseded:** none found. The newest poker product migration is `migration_poker_admin_ops.sql` (2026-07-01). The Prompt-14 feature-flag work added **no** SQL (flags are env-only), so there is **no newer poker migration** than the eight listed.

No dedicated `poker_social_tests.sql` exists — social RLS is covered structurally (self-scoped policies) and the code path is degrade-safe.

---

## 2. Verified production apply order

Apply **in this exact order**. Each is additive, idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), and non-destructive to existing TLMN/Caro/wallet data.

```
0. migration_tlmn_run7_economy.sql   ← PREREQUISITE (already applied in prod)
     └─ itself requires the function public.tlmn_touch_updated_at()
        (defined in migration_tlmn.sql; already in prod)
1. migration_poker_core.sql
2. migration_poker_private.sql
3. migration_poker_economy.sql
4. migration_poker_lifecycle.sql
5. migration_poker_engine.sql
6. migration_poker_admin_ops.sql
7. migration_poker_social.sql
```

> **Note on steps 6–7 (social vs admin_ops):** these two are **mutually independent** —
> `migration_poker_social.sql` references only `poker_tables` (core) + `auth.users`, and
> `migration_poker_admin_ops.sql` does not reference any social object. So **either relative
> order is valid** (`…engine → admin_ops → social` OR `…engine → social → admin_ops`). The
> Prompt-15 operator brief listed social as step 6 and admin_ops as step 7; that is equally
> correct. What is fixed is that both come **after** engine, and social comes **after** core.

---

## 3. Dependency evidence (why this order)

- **run7 economy is a hard prerequisite** — `migration_poker_economy.sql:27-28` runs
  `ALTER TABLE public.coin_ledger DROP/ADD CONSTRAINT coin_ledger_reason_check` and reads/writes
  `public.game_wallets` + `public.coin_ledger`. Those tables are created **only** in
  `migration_tlmn_run7_economy.sql` (lines 22/31/45). `poker_lifecycle` also reads
  `game_wallets`/`coin_ledger`. → run7 economy MUST precede poker economy & lifecycle.
- **run7 economy needs the touch fn** — `migration_tlmn_run7_economy.sql:56`
  `... EXECUTE FUNCTION public.tlmn_touch_updated_at()`, defined in `migration_tlmn.sql:45`.
  On a fresh preview branch (which does NOT inherit prod's manually-applied loose SQL) this
  function must be bootstrapped before run7 economy. In prod it already exists.
- **core → private** — `poker_private` FKs `poker_hole_cards.hand_id → poker_hands(id)` (core).
- **core/private → economy** — economy RPCs reference `poker_seats`, `poker_hands`,
  `poker_actions`, `poker_hand_settlements`.
- **economy → lifecycle** — lifecycle top-up/closure reuse the wallet/ledger discipline and the
  seat/escrow columns; header declares "Apply AFTER the three poker migrations".
- **lifecycle → engine** — engine header: "Apply AFTER poker_core → private → economy →
  lifecycle"; settlement reuses `poker_settle_hand`/`poker_refund_hand` from economy.
- **engine → admin_ops** — admin_ops header: "Apply AFTER core → private → economy → lifecycle →
  engine"; freeze/refund act on live hand + settlement objects.
- **social** — references only `poker_tables` (core) + `auth.users`; degrade-safe; safe to apply
  last (or any time after core).

---

## 4. Branch (isolated) validation recipe

To validate on a **throwaway** preview branch (never prod):

```
1. Bootstrap prereq fn:   CREATE OR REPLACE FUNCTION public.tlmn_touch_updated_at() ...
2. Apply migration_tlmn_run7_economy.sql
3. Apply poker 1..7 in the order above
4. Run each harness (each is one BEGIN … ROLLBACK txn, persists nothing):
     poker_db_tests.sql, poker_lifecycle_tests.sql, poker_engine_tests.sql,
     poker_admin_ops_tests.sql, poker_full_hand_conservation_test.sql
5. Re-apply migrations 1..7 a second time to confirm idempotency (no error).
6. DELETE the branch.
```

---

## 5. Rollback (corrective only — never part of apply)

- `migration_poker_admin_ops_rollback.sql` — remove admin-ops layer only.
- `migration_poker_rollback.sql` — remove the full poker persistence layer; restores the
  `coin_ledger` reason CHECK to its pre-poker superset. Run only with flags off and no live hands.
