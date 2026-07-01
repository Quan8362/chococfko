# Poker Reuse Matrix — Chợ Cóc FKO

**Date:** 2026-06-30 · Companion to [01-preflight-audit](01-preflight-audit.md).

Legend:
- ✅ **REUSE AS-IS** — import/use directly, no change.
- 🔧 **REUSE AFTER REFACTOR** — sound foundation, needs extension or hardening before Poker depends on it.
- ⛔ **DO NOT REUSE** — TLMN-specific or too loose for money-bearing Poker; build a Poker-specific equivalent.
- 🆕 **BUILD FROM SCRATCH** — no analog exists.

---

## 1. Reusable systems (✅ AS-IS)

| System | Source | Why safe to reuse |
| --- | --- | --- |
| Browser Supabase singleton | [lib/supabase/client.ts](../../lib/supabase/client.ts) | One instance avoids JWT-refresh races that kill realtime. Use for Poker subscriptions + own-hole-card reads. |
| Server (cookie) client | [lib/supabase/server.ts](../../lib/supabase/server.ts) | Resolves `auth.uid()` for player-facing RPCs. |
| Service-role client | [lib/supabase/admin.ts](../../lib/supabase/admin.ts) | All authoritative writes. Already server-only. |
| Cookie-free anon client | [lib/supabase/public.ts](../../lib/supabase/public.ts) | Cache-safe public lobby lists. |
| Auth + session resilience | middleware, `AuthSync.tsx`, memory `auth-session-persistence`/`oauth-callback-i18n` | Hardened; identity = `auth.uid()` server-side. |
| Identity resolution | [lib/userIdentity.ts](../../lib/userIdentity.ts) `getUserIdentity`, `UserAvatar`, `lib/games/tlmn/avatar.ts` pattern | Profiles→auth-metadata→email fallback; live-hydrate avatars. |
| Coin wallet substrate | `game_wallets`, `coin_ledger`, `round_settlements`, `ensure_wallet`/`get_wallet`/`claim_daily_coins` ([migration_tlmn_run7_economy.sql](../../supabase/migration_tlmn_run7_economy.sql)) | Integer `bigint`, RLS read-own, no client writes, daily grant. Poker shares the same wallet. |
| Economy constants/formatters | [lib/game/economy.ts](../../lib/game/economy.ts) | `formatCoins*`, integer-only, entry-gate constant. |
| Coin-tier badge | `lib/games/coinTier.ts`, `CoinTierBadge.tsx` | Shared rank badge across games. |
| Game registry + routing | [app/games/page.tsx](../../app/games/page.tsx) `GAMES[]`, `next-intl` locale, 5 locale `messages/*.json` | Add Poker = additive registry row + i18n ns. |
| Pure-engine + `node --test` pattern | `lib/games/tlmn/*` (no React/Supabase imports) | Template for `lib/games/poker/`. |
| Sound singleton | `useTlmnSound.ts` (module-level AudioContext, memory `tlmn-mobile-layout-sound`) | Copy pattern verbatim for Poker sound. |
| Per-game folder template | `app/games/tlmn/{page,actions,[roomCode]/...}` | Structural template. |
| Abandoned-game cron slot | [vercel.json](../../vercel.json) `/api/cron/tlmn-maintenance` | Add an analogous `/api/cron/poker-maintenance` (or extend) — pattern proven. |
| Tooling | `build`/`lint`/`typecheck`/`test`/`i18n:check`, Playwright `e2e/tlmn` | Mirror into `e2e/poker`. |

---

## 2. Systems requiring refactoring (🔧)

| System | Source | Required change before Poker depends on it |
| --- | --- | --- |
| **Hidden-hand model** | `tlmn_hands` RLS-read-own, not published ([migration_tlmn_phase3.sql](../../supabase/migration_tlmn_phase3.sql)) | Pattern is correct, but Poker needs it **extended**: a Poker `hole_cards` table (RLS read-own, no write policy, not published) **plus a fully server-only deck/stub table with NO select policy at all**. TLMN never had to hide a *deck of future cards*; Poker does. |
| **Public game-state row** | `tlmn_games` `SELECT USING(true)` + published | Reuse the *posture* (public row carries no secret data) but Poker's public row must be engineered so the engine **can never** write un-turned board cards or hole cards into it. New table, same discipline. |
| **Turn timer** | `turn_deadline`/`turn_started_at`/`GRACE_MS` + client-nudged `tickTurnTimer` | Extend semantics: timeout → **fold** (or auto-check if checking is free); add per-street action clock. Reuse the authoritative-deadline mechanics. |
| **Realtime client sync** | `TlmnRoom.tsx` reconcile-on-resubscribe + nudge-polling | **Upgrade to Caro-grade**: continuous **recovery watchdog (timer + visibilitychange + online)** + **monotonic `state_version`** guard + `setAuth` on token refresh + malformed-state refetch (memory `caro-realtime-sync`). Money-bearing betting cannot rely on nudge-polling alone. |
| **Settlement reaper** | `reapAbandonedGames` (memory `tlmn-abandoned-match-reaper`) | Poker's reaper must **safely resolve escrowed stacks** on abandonment (refund or settle the live hand), not just flip status. New logic, same scan/cron/nudge skeleton. |
| **Social/FX layer** | `interactions.ts` + `tlmn-fx:` broadcast | Optional. If reused, ensure no game-secret ever rides a broadcast channel. |

---

## 3. Systems that must NOT be reused (⛔)

| System | Source | Why not |
| --- | --- | --- |
| **`tlmn_rooms` / `tlmn_seats` write RLS** | [migration_tlmn.sql](../../supabase/migration_tlmn.sql): `FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)` | **Too permissive.** Any authenticated user can directly `UPDATE`/`INSERT` rooms/seats from the anon client, bypassing server actions. TLMN tolerates this because writes *also* go through service-role and the stakes are card-points. **Poker tables/seats hold escrowed coins** — Poker game-state tables must follow the `game_wallets`/`tlmn_hands` posture: **RLS SELECT-scoped, NO client write policy at all** (service-role only). |
| **`settle_round` RPC** | [migration_tlmn_run7_economy.sql](../../supabase/migration_tlmn_run7_economy.sql) | TLMN-shaped: `card_delta × COIN_PER_POINT`, keyed on `(game_code, round_number)`. Poker settlement is pot/side-pot based, keyed on a hand id. Build `poker_settle_hand` reusing the **idempotency + FOR UPDATE + ledger** discipline, not this function. |
| **TLMN engine / round / bot** | `lib/games/tlmn/*` | Trick-taking Tiến Lên rules — no relation to NLHE betting/hand-ranking. Use only as a *structural* template. |
| **TLMN-specific UI** (`TlmnTable.tsx`, rules panel, đếm-lá scoreboard) | `app/games/tlmn/[roomCode]/*` | Game-specific. Poker table/board/pot/bet-slider UI is new. |
| **TLMN stats/achievements schema** | `migration_tlmn_achievements.sql`, `recordRoundStats` | TLMN-shaped (placements, đếm-lá). Poker needs its own hands-played/won/biggest-pot stats. |

---

## 4. Systems that must be BUILT FROM SCRATCH (🆕)

| System | Notes |
| --- | --- |
| **NLHE pure engine** | `lib/games/poker/` — 52-card deck + shuffle (server-side CSPRNG), 5-card hand evaluator, betting state machine (preflop/flop/turn/river/showdown), legal-action computation (fold/check/call/bet/raise/all-in), min-raise / blind / button rotation. Fully unit-tested with `node --test`, **zero** React/Supabase imports. |
| **Pot & side-pot math** | Integer-only side-pot allocation across all-ins; deterministic, unit-tested against known edge cases (multiway all-ins of unequal stacks). |
| **Stack escrow RPCs** | `poker_sit_down` (wallet→table stack, `FOR UPDATE`, entry-gate, idempotent), `poker_stand_up` (table stack→wallet), `poker_rebuy/top_up`. All SECURITY DEFINER, ledger-writing, REVOKEd from clients except where strictly `auth.uid()`-scoped. |
| **Hand settlement RPC** | `poker_settle_hand(hand_id, payouts jsonb)` — idempotent via a `poker_hand_settlements` lock table, `FOR UPDATE` per stack, integer payouts summing exactly to the pot. Service-role only. |
| **Poker schema** | `poker_tables`, `poker_seats` (with `stack`), `poker_hands` (public board state), `poker_hole_cards` (RLS-private), `poker_deck` (server-only, no SELECT), `poker_actions` (audit log of every bet/fold), `poker_hand_settlements` (idempotency lock). |
| **Secure action RPC / server actions** | `poker_act(table_id, action, amount)` — validates seat, turn, legal action set, amount bounds, deadline; advances the betting state machine; writes public state + private hole cards via service role. Caro-grade secure-move discipline. |
| **Board reveal logic** | Server-side flop/turn/river reveal; showdown hole-card reveal of only contesting players. |
| **Deck secrecy + shuffle provenance** | CSPRNG shuffle server-side; deck never leaves the server-only table; optional commit-reveal hash for fairness auditing. |
| **Poker bot AI** | New; can follow the TLMN sim/optimizer scaffolding as a template. |
| **Poker table UI** | Board, pot, bet slider, action buttons, all-in/side-pot visualization, landscape-locked mobile layout (reuse seat-positioning lessons). |
| **Poker stats/leaderboard** | Hands played/won, biggest pot, VPIP-style metrics (optional). |

---

## 5. One-line decision per major concern

- **Identity / auth** → ✅ reuse.
- **Wallet substrate** → ✅ reuse; 🆕 add Poker escrow + settlement RPCs.
- **Hidden cards** → 🔧 reuse posture, extend to deck-secrecy.
- **Game-state writes** → ⛔ never reuse TLMN's loose room/seat RLS; build SELECT-only + service-role-write tables.
- **Realtime** → 🔧 upgrade TLMN's pattern to Caro-grade (watchdog + version + secure RPC).
- **Engine / rules / UI** → 🆕 build NLHE from scratch on the proven structural template.
