# Poker Risk Register — Chợ Cóc FKO

**Date:** 2026-06-30 · Companion to [01-preflight-audit](01-preflight-audit.md), [02-reuse-matrix](02-reuse-matrix.md), [03-implementation-roadmap](03-implementation-roadmap.md).

Severity: 🔴 Critical (cheat / coin loss / privacy breach) · 🟠 High · 🟡 Medium.
Each risk lists the evidence basis, the mitigation, and the phase that closes it.

---

## A. Private-card risks (🔴 highest priority)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| A1 | **Opponent hole cards leak** via a public `select('*')`, broadcast, spectator payload, log, or analytics event. | TLMN solves the analogous risk by keeping `tlmn_hands` RLS-read-own + unpublished + anon-client fetch ([migration_tlmn_phase3.sql](../../supabase/migration_tlmn_phase3.sql), `fetchMyHand`). | `poker_hole_cards`: RLS read-own, **no write policy**, **not in realtime publication**; clients fetch own via anon client only. Privacy assertion tests on every payload. | P2/P3 |
| A2 | **Undealt deck / future board cards readable** (worse than TLMN — TLMN never stored a live deck). | New surface; no existing analog. | `poker_deck`/stub table has **NO SELECT policy at all** (service-role only); never published; engine deals server-side. | P2/P3 |
| A3 | **Un-turned board cards written into the public row** before they're revealed. | Public `poker_hands` row is broadcast. | Engine writes flop/turn/river into the public row **only at reveal**; unit + payload tests assert the public row never holds future cards. | P1/P3 |
| A4 | **Showdown over-reveal** — revealing folded players' hole cards. | New. | Server reveals only contesting hands at showdown; mucked hands stay private. | P3 |

---

## B. Coin-integrity risks (🔴/🟠)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| B1 | **Double-settlement** (reconnect/retry pays a pot twice). | TLMN prevents this with `round_settlements` PK + `ON CONFLICT DO NOTHING` + `IF NOT FOUND RETURN settled:false` ([migration_tlmn_run7_economy.sql](../../supabase/migration_tlmn_run7_economy.sql)). | `poker_hand_settlements(hand_id)` idempotency lock; `poker_settle_hand` is service-role only. | P2 |
| B2 | **Float rounding / coin creation or destruction** in pot/side-pot split. | Economy is integer `bigint` only ([lib/game/economy.ts](../../lib/game/economy.ts)). | Integer-only side-pot math; invariant test: `Σ payouts == pot` exactly; no floats anywhere. | P1/P2 |
| B3 | **Escrow leak** — coins lost/duplicated on sit-down/stand-up or table crash. | New (TLMN has no stack escrow). | `poker_sit_down`/`poker_stand_up` use `FOR UPDATE` + ledger rows; conservation test (wallet+stack total constant); reaper safely returns stacks on abandonment. | P2/P6 |
| B4 | **Client-authoritative coin update** (browser writes a balance/stack). | TLMN forbids client wallet writes (no INSERT/UPDATE/DELETE policy). | Same posture: no client write policy on wallet or any Poker table; all coin moves in SECURITY DEFINER RPCs. | P2 |
| B5 | **Race on concurrent stack mutation** (two actions on one seat). | TLMN settlement uses `SELECT ... FOR UPDATE` with deterministic lock order. | Same: `FOR UPDATE` per seat/wallet, deterministic lock order to avoid deadlocks. | P2 |
| B6 | **Negative stack / over-bet** (bet more than stack). | New. | Engine + RPC clamp/validate amount ≤ stack; `CHECK` constraints; all-in handling. | P1/P3 |

---

## C. Server-authority / tampering risks (🔴)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| C1 | **Direct client writes to game-state tables** bypassing server actions. | ⚠️ **TLMN's `tlmn_rooms`/`tlmn_seats` allow this** (`FOR ALL TO authenticated USING(auth.uid() IS NOT NULL)`) — [migration_tlmn.sql](../../supabase/migration_tlmn.sql). Acceptable for card-points, **not** for escrowed coins. | **Poker tables/seats/hands get NO client write policy** — SELECT-scoped only, service-role writes. Explicit deviation from TLMN. | P2 |
| C2 | **Client submits another user's id / acts out of turn / illegal action.** | TLMN actions derive identity from `auth.getUser()` and validate `turn_seat === mySeat` + deadline ([actions.ts](../../app/games/tlmn/actions.ts) `playCards`). | Same validation order in `pokerAct`; browser sends intent only. | P3 |
| C3 | **Move-tampering via direct PATCH** (set winner/pot/board). | Caro had this exact hole; fixed by `caro_make_move` SECURITY DEFINER RPC + REVOKE direct writes (memory `caro-secure-moves`). | Poker mutations only via service-role actions / definer RPCs; REVOKE direct table writes from anon/authenticated. | P2/P3 |
| C4 | **Stale-state acceptance** (act on an old hand snapshot). | TLMN re-reads `latestGame(onlyPlaying)` before applying; Caro added monotonic `state_version`. | Re-read authoritative state in every action; monotonic `state_version` on `poker_hands`; reject stale. | P3/P4 |
| C5 | **Service-role key exposure in browser.** | `createAdminClient` is server-only ([admin.ts](../../lib/supabase/admin.ts)); no poker code exists yet. | Never import admin client into a Client Component; lint/review gate. | all |

---

## D. Realtime risks (🟠)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| D1 | **"Player acts but opponent never sees it until refresh."** | Documented real failure for Caro (memory `caro-realtime-sync`). TLMN live table relies on **nudge-polling + reconcile-on-resubscribe only** ([TlmnRoom.tsx](../../app/games/tlmn/[roomCode]/TlmnRoom.tsx)) — weaker than needed for betting. | Adopt **Caro-grade** client: recovery watchdog (timer + visibilitychange + online) + monotonic `state_version` + `setAuth` on token refresh + malformed-state refetch. | P4 |
| D2 | **JWT refresh kills the subscription** (multi-instance race). | Browser client is a **singleton** specifically to avoid this ([client.ts](../../lib/supabase/client.ts)). | Reuse the singleton; `setAuth` on `TOKEN_REFRESHED`. | P4 |
| D3 | **Animation/UI delays authoritative state.** | Project rule: UI must never control/delay server state. | UI animations are presentation-only; state transitions come from server payloads, never from animation completion. | P5 |
| D4 | **Duplicate realtime events double-apply.** | Caro `state_version` guard. | Idempotent client reducer keyed on `state_version`; idempotent server RPCs. | P3/P4 |

---

## E. Lifecycle / availability risks (🟠/🟡)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| E1 | **Table stuck mid-hand after all humans leave** → escrowed coins stranded. | TLMN had the analogous "stuck in `playing`" bug; fixed by `reapAbandonedGames` + cron + lobby-nudge (memory `tlmn-abandoned-match-reaper`). | `poker-maintenance` reaper scans abandoned tables and **safely settles/refunds escrow**; cron `* * * * *` is throttled in practice so the lobby-load nudge is the real workhorse. | P6 |
| E2 | **AFK player blocks the table.** | TLMN: timeout reaper + AFK→bot takeover after missed turns (memory `tlmn-phase5`). | Action clock → auto-fold (or auto-check) on timeout; client-nudged `tickActionTimer`. | P6 |
| E3 | **Migration applied out of order** (code calls RPC that doesn't exist yet). | Real ordering hazards in Caro (`caro-secure-moves`/`caro-join-rpc`). | One migration per phase, applied manually before the dependent deploy; routes degrade-safe pre-migration. | all |
| E4 | **Wrong Vercel project / accidental prod alias.** | Two projects; local `vercel --prod` once caused a prod 404 (memory `deploy-infrastructure`). | Deploy ONLY via commit+push to `main`; never `vercel --prod`/alias locally. | all |

---

## F. Build / tooling risks (🟡)

| # | Risk | Evidence basis | Mitigation | Closed in |
| --- | --- | --- | --- | --- |
| F1 | **Windows `next build` crashes in ESLint worker** (environment, not code). | Memory `tlmn-audit-harden`. | Iterate with `typecheck` + `node --test`; trust CI/Vercel build for the real signal. | all |
| F2 | **i18n parity drift** across 5 locales. | `i18n:check` script exists. | Add `poker` ns to all 5 `messages/*.json`; run `npm run i18n:check`. | P7 |
| F3 | **SQL not linted** (ESLint ignores `supabase/`). | [.eslintrc.json](../../.eslintrc.json) ignore list. | Manual migration review + RPC tests carry the load. | P2 |

---

## G. Unresolved questions (cannot be answered from repository evidence)

These need a product/owner decision before or during the relevant phase:

1. **Cash game vs tournament (SNG/MTT)?** Schema differs (rebuys/blind levels/elimination). Assume **cash game ring** first unless told otherwise.
2. **Table size:** heads-up only, 6-max, or 9-max? Affects seat schema, side-pot tests, and the asset layout.
3. **Stakes / blind structure & buy-in range** in "xu" — fixed tiers or host-configurable? Drives the entry-gate and escrow constants.
4. **Rake?** If yes, integer rake + cap + a ledger reason — but as a play-money social casino, likely **no rake**. Needs confirmation.
5. **Spectators allowed?** If yes, the public-row design must guarantee spectators get the same public-only payload (no hole cards). Default: **mirror TLMN** (public state is spectator-safe).
6. **Bots / play-vs-bots mode** like TLMN Mode A? Reuses sim scaffolding if yes.
7. **Run-it-twice / all-in insurance / straddles / ante** — advanced rules; assume **out of scope** for v1.
8. **Provably-fair shuffle (commit-reveal hash)** — nice-to-have for trust; confirm whether v1 needs it or a server CSPRNG shuffle suffices.
9. **Hand-history persistence depth** — full replayable action log (`poker_actions`) vs summary only? Project principle favors **auditable + replayable**, so default to a full action log.
10. **Reconnect-into-active-hand UX** — does a returning player resume their seat mid-hand, or is their hand auto-folded after a grace period? Affects escrow/reaper design.

---

## H. Top-5 risks to never lose sight of

1. 🔴 **A1/A2 — never let a hole card or deck card reach a client that shouldn't see it.** (Privacy assertion tests on every payload.)
2. 🔴 **C1 — Poker game-state tables must have NO client write policy** (do not copy TLMN's loose room/seat RLS).
3. 🔴 **B1/B2/B3 — idempotent, integer-only, conserved coin settlement** with `FOR UPDATE` + ledger.
4. 🟠 **D1 — Caro-grade realtime recovery**, not TLMN's nudge-polling, for money-bearing betting.
5. 🟠 **E1/E3/E4 — safe escrow on abandonment + ordered manual migrations + deploy only via push to `main`.**
