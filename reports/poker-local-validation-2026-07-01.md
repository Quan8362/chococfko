# Chợ Cóc FKO — Poker Local-Stack Validation Report

**Date:** 2026-07-01
**Scope:** Apply the 8 pending Poker migrations + run the 5 DB harnesses on a **fully isolated local Supabase stack** (never production).
**Method:** Local Supabase (Docker) inside WSL2 Ubuntu. Migrations applied in dependency order; each harness runs in a single `BEGIN … ROLLBACK` transaction (persists nothing). **Production was never touched.**

---

## 0. Executive summary

The Poker **migration set applies cleanly in order and the authoritative DB/coin/security core is green** on a local Supabase database with the real Supabase primitives (`auth.users`, `anon`/`authenticated`/`service_role` roles, RLS):

1. **7 poker migrations + 1 prereq bootstrap apply with zero errors, in dependency order.**
2. **All 5 DB harnesses PASS (0 failures), 127 assertions total**, when the schema is applied via the **faithful hosted path (`supabase_admin`)**.
3. A **real, mechanistically-explained caveat** was found about *how* migrations must be applied so `authenticated` keeps `SELECT` on the read-own tables — see §4. It is a Supabase default-privilege behaviour, **not a defect in the migrations**, but it is a live go-condition for the prod apply.

**Recommendation: GO for applying these migrations to production**, provided they are applied through the normal Supabase path (SQL Editor / migration runner = `supabase_admin`-equivalent), which is how prod migrations are already applied. See §6.

---

## 1. Environment & safety

- **100% isolated. Production (`chococfko`) was never contacted.** No `.env.local`, no remote Supabase project, no preview branch (avoided the previously-seen `CREATING_PROJECT` stall + billing).
- Toolchain, all local:
  - Windows 11 + **WSL2** (kernel 2.7.10) + **Ubuntu 26.04 LTS**
  - **Docker Engine 29.1.3** (installed inside Ubuntu via `apt`, systemd-managed — no Windows admin, no Docker Desktop)
  - **Supabase CLI 2.109.0**, **psql 18.4**
  - Local stack project: `~/poker-local` (`supabase start` — full local Supabase: db on `127.0.0.1:54322`, auth, rest, realtime, studio, storage)
- The local DB was `supabase db reset` to a pristine state before the authoritative (v3) run.

## 2. Prerequisite bootstrap (fresh local stack starts empty)

A bare local stack has no TLMN objects, so two shared prerequisites the poker migrations depend on were seeded first, **copied verbatim from the production migrations** (faithful):

| Prereq | Source | Needed by |
|---|---|---|
| `public.tlmn_touch_updated_at()` | `migration_tlmn.sql` | `poker_core` `updated_at` triggers |
| `game_wallets` / `coin_ledger` / `round_settlements` | `migration_tlmn_run7_economy.sql` | `poker_economy` (ALTERs `coin_ledger`, reads/writes `game_wallets`) |

## 3. Migrations applied (in dependency order) — ✅ ALL PASS

Order is dictated by each file's own `Apply AFTER …` header:

| # | Migration | Result |
|---|---|---|
| 0 | *(bootstrap prereqs — §2)* | ✅ PASS |
| 1 | `migration_poker_core.sql` | ✅ PASS |
| 2 | `migration_poker_private.sql` | ✅ PASS |
| 3 | `migration_poker_economy.sql` | ✅ PASS |
| 4 | `migration_poker_lifecycle.sql` | ✅ PASS |
| 5 | `migration_poker_engine.sql` | ✅ PASS |
| 6 | `migration_poker_admin_ops.sql` | ✅ PASS |
| 7 | `migration_poker_social.sql` | ✅ PASS |

All are `IF NOT EXISTS` / additive / idempotent and touched no non-poker object beyond the intended `coin_ledger` reason-CHECK widening.

## 4. Key finding — `SELECT` on read-own tables depends on the applying role (NOT a migration bug)

The poker migrations deliberately only `REVOKE INSERT/UPDATE/DELETE` from `anon`/`authenticated` and **rely on Supabase's default privileges to grant `SELECT`** to `authenticated` on the RLS read-own tables (`poker_hole_cards`, `poker_seats`, `poker_tables`, `poker_hands`, `poker_actions`). Local `pg_default_acl` shows this grant is **creator-role dependent**:

- Table created by **`supabase_admin`** → `anon`/`authenticated` inherit `arwdDxtm` (**includes `SELECT`**). ← hosted Supabase / SQL Editor / migration runner path.
- Table created by **`postgres`** (the role exposed on local port `54322`) → `anon`/`authenticated` get only `Dxtm` (**no `SELECT`**).

**Consequence during validation:**

| Run | Applied as | Harness result |
|---|---|---|
| v1 | `postgres` (port 54322) | 3/5 pass; **H1 + H2 failed** with `permission denied for table poker_hole_cards / poker_seats` under role `authenticated` |
| v3 | **`supabase_admin`** (container socket — faithful to hosted) | **5/5 pass, 0 failures** |

The v1 failures are a **local-connection artifact**, reproduced and then resolved by applying via the same role hosted Supabase uses. This is consistent with the prior preview-branch validation (23 assertions green).

## 5. DB harnesses (v3, applied as `supabase_admin`) — ✅ ALL PASS

Each harness runs in one transaction that **rolls back** (persists nothing). A failed assertion `RAISE`s and aborts.

| Harness | Assertions (RAISE guards) | Result |
|---|---|---|
| `poker_db_tests.sql` | 26 | ✅ PASS — RLS read-own hole cards / no-policy deck / opaque secrets; no client writes; sit-down/stand-up escrow + idempotency; side-pot settlement sums; non-conserving payout rejected; refund idempotency |
| `poker_lifecycle_tests.sql` | 29 | ✅ PASS — seat reserve/contention/entry-gate; top-up idempotency+cap; sit-out/return; disconnect keeps seat+escrow; safe closure; closure refuses a live hand; idle reap |
| `poker_engine_tests.sql` | 27 | ✅ PASS — atomic `start_hand`; start idempotency; `commit_action`; CAS rejects stale command; idempotency-key dedupe; conservation guard blocks coin minting; settlement-retry pays once; `pause_hand` |
| `poker_admin_ops_tests.sql` | 36 | ✅ PASS — append-only audit; reason required; pause/freeze/refund idempotent+audited; incident FSM; restrictions; hole-card reveal terminal-only + no card values in audit; opaque admin tables |
| `poker_full_hand_conservation_test.sql` | 9 | ✅ PASS — a complete multi-player hand through the authoritative RPCs, total-coin conservation asserted at every step |
| **Total** | **127** | **✅ 0 failures** |

## 6. Go / No-Go recommendation for production

**GO** — apply the migrations to production, in this order, **through the normal Supabase apply path** (Supabase SQL Editor or the migration runner — i.e. the `supabase_admin`-equivalent role), which is how this project already applies its manual SQL:

```
(prereqs already in prod: tlmn_touch_updated_at + game_wallets/coin_ledger)
1. migration_poker_core.sql
2. migration_poker_private.sql
3. migration_poker_economy.sql
4. migration_poker_lifecycle.sql
5. migration_poker_engine.sql
6. migration_poker_admin_ops.sql
7. migration_poker_social.sql   (any time after core)
```

**Conditions / follow-ups:**
1. **Apply as the Supabase-managed role (SQL Editor / migration runner), NOT via a raw `postgres` psql connection**, or `authenticated` will lack `SELECT` on the read-own tables and the live table/hole-card reads will 403. (This is how prod already applies SQL, so the default path is correct — just don't use an external superuser psql.)
2. After apply, spot-check on prod that `authenticated` has `SELECT` on `poker_hole_cards`, `poker_seats`, `poker_tables` (RLS still restricts rows). If not, add explicit `GRANT SELECT … TO authenticated` for those five read tables.
3. The prereqs (`game_wallets`, `coin_ledger`, `tlmn_touch_updated_at`) already exist in prod (TLMN live) — the bootstrap in §2 was only for the empty local stack. Do **not** re-run the bootstrap against prod.
4. Poker ships gated: server-only, flags default OFF, kill switch `POKER_ENABLED=false` — unchanged by this validation.

## 7. What this run did NOT cover

- **Browser / UI matrix** (multi-user live table, responsive, a11y, perf) — out of scope here; still the outstanding gate per the prior QA report.
- Realtime broadcast payload privacy at the wire (covered by pure tests + `assertSnapshotPrivacy`, not re-exercised live here).

---

**Bottom line:** migrations are ordered correctly, apply cleanly, and the full authoritative DB/coin/security core passes 127/127 assertions on an isolated local Supabase — **READY to apply to prod via the standard Supabase SQL path**, with the role caveat in §6 as the one thing to respect.
