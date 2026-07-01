# Poker Test Plan — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** every rule/architecture doc. Each test references a **rule ID** from [../rules/engine-rule-specification](../rules/engine-rule-specification.md), [../rules/state-machine](../rules/state-machine.md), the architecture docs, or an **edge-case ID** (`EC-*`) from [../rules/edge-case-matrix](../rules/edge-case-matrix.md).

> **Two non-negotiable release invariants, asserted as first-class tests:**
> 1. **Privacy** — no payload (server-action return, realtime event, spectator view, log, cache, analytics) ever contains another player's un-revealed hole cards or any deck card (`SECURITY-HOLE-CARDS-001`).
> 2. **Coin integrity** — settlement is integer-only, idempotent, and conserved: `Σ awards + Σ refunds == Σ contributions`, applied exactly once (`POT-CONSERVE-001`, `COIN-IDEMPOTENCY-001`).
> No phase is "done" while a test covering its 🔴 rows in the edge-case matrix is failing or absent.

---

## 1. Test layers & tooling

| Layer | Tooling | Location | Proves |
| --- | --- | --- | --- |
| Engine (unit) | `node --test` | `lib/games/poker/*.test.ts` | hand ranking, betting legality, side-pot math, blind/button rotation. Pure, deterministic (seeded). |
| RPC / DB | SQL-level + integration (service-role harness) | `e2e/poker/` + SQL fixtures | idempotent settlement, escrow conservation, `FOR UPDATE` race safety, **no policy leaks**. |
| Server actions | integration | `e2e/poker/actions-*.spec.ts` | validation rejects wrong-turn/illegal-amount/expired/foreign-id; payloads carry no foreign hole cards/deck. |
| Realtime | Playwright | `e2e/poker/realtime-*.spec.ts` | watchdog recovers dropped updates; `state_version` rejects stale; reconnect restores; token-refresh survives. |
| Responsive / UI | Playwright matrix | `e2e/poker/responsive.spec.ts` | desktop / tablet / mobile-landscape layouts; portrait rotate screen. |
| i18n | `npm run i18n:check` | — | 5-locale parity for the `poker` namespace. |
| Quality gates | `npm run typecheck`, `npm run lint` | — | type + lint clean. (Windows `next build` ESLint-worker quirk — rely on `typecheck` + CI build, memory `tlmn-audit-harden`.) |

Commands: `npm test` (`node --test "lib/**/*.test.ts"`), `npm run typecheck` (`tsc --noEmit --skipLibCheck`), `npm run lint`, `npm run i18n:check`, Playwright `e2e/poker` (mirror `test:e2e:tlmn`).

---

## 2. Engine unit tests (Phase P1 — pure, no DB/UI)

### 2.1 Hand evaluator (`evaluator.test.ts`)
- Full category ladder ordering (`HAND-RANK-001`) — one fixture per category, all comparisons.
- Kicker resolution for quads/trips/two-pair/pair/high (`HAND-TIE-001`, EC-A8/A9).
- Exact tie returns compare==0; suits never break ties (`HAND-EXACT-TIE-001`, `CARD-SUIT-001`, EC-A1/A6).
- Wheel straight valid, top card 5 (`HAND-STRAIGHT-WHEEL-001`, EC-A3); wraparound invalid (`HAND-STRAIGHT-WRAP-001`, EC-A4); Broadway highest.
- Steel wheel vs royal straight flush (`HAND-SF-001`, EC-A10).
- "Board plays" → all contenders tie (`HAND-USE-001`/`HAND-INV-003`, EC-A2).
- Property test: evaluation independent of input order / seat (`HAND-INV-001`).

### 2.2 Betting state machine (`betting.test.ts`)
- Legal-action set per situation: check only when to-call==0 (`ACTION-CHECK-001`, EC-C1); min opening bet = BB (`BET-MIN-001`, EC-C2).
- Min-raise increment = last bet/raise; first preflop raise ≥ 2×BB (`RAISE-MIN-001`, EC-C3/C4).
- Short all-in does not reopen (`ALLIN-SHORT-001`/`ALLIN-NOREOPEN-001`, EC-C5/C10); cumulative shorts don't aggregate (`ALLIN-CUMULATIVE-001`, EC-C6); full raise reopens (`RAISE-FULL-001`/`ALLIN-REOPEN-001`, EC-C7).
- All-in call for less (`ALLIN-CALLSHORT-001`, EC-C8); over-bet clamped to stack (`BET-MAX-001`, EC-C9).
- Round completion + street advance reset (`ROUND-COMPLETE-001`/`ROUND-ADVANCE-001`, EC-C11); all-but-one all-in → runout (`ROUND-ALLIN-RUNOUT-001`, EC-C12).
- BB option to check/raise preflop (`ACTION-BB-OPTION-001`, EC-B1).

### 2.3 Button & blinds (`engine.test.ts`)
- 3+ handed SB/BB/UTG order + BB acts last preflop (`BLIND-001`, EC-B1).
- Heads-up: button=SB acts first preflop, BB first postflop (`BLIND-HEADSUP-001`/`-POSTFLOP-001`, EC-B2).
- Into/out-of heads-up transitions, no double BB (`BUTTON-HEADSUP-INTO/OUTOF-001`, EC-B3/B4).
- Dead-button continuity when a poster leaves (`BLIND-DEADBTN-001`, EC-B5).
- Short blind → all-in for less (`BLIND-SHORT-001`, EC-B6).

### 2.4 Pot & side-pots (`pot.test.ts`) — 🔴 integer correctness
- Uncalled-bet refund before awards (`POT-UNCALLED-001`, EC-D1/D7).
- Multiway all-in unequal stacks → correct main + layered side-pots, each independent (`POT-MAIN/SIDE-001/002`, `POT-INDEP-001`, EC-D2/D3/D6).
- Folded chips are dead money, folder ineligible (`CONTRIB-FOLDED-001`/`POT-ELIG-001`, EC-D4).
- Odd-chip to earliest seat left of button, never suit (`POT-ODD-001`, EC-D5).
- **Conservation property test:** for randomized seeded multiway all-ins, `Σ awards + Σ refunds == Σ contributions` and `Σ deltas == 0`, integer-only (`POT-CONSERVE-001`/`COIN-INT-001`, EC-D8/D10).

### 2.5 Engine orchestration & replay (`engine.test.ts`, `qa-acceptance.test.ts`)
- Full hand deal→streets→showdown from a seed reproduces identical cards/pots/winners (`ENGINE-DETERMINISM-001`).
- Replay an action log against the seed reproduces the recorded settlement (`ENGINE-REPLAY-001`, EC-H9).
- Showdown order + muck: only non-mucking contenders' cards in the reveal output; folded/mucked never present (`SHOWDOWN-ORDER/MUCK/REVEAL-001`, EC-E1/E2/E3/E7).
- One-left short-circuit: no showdown, no reveal (`POT-ONELEFT-001`, EC-D7/E2).

---

## 3. DB / RPC tests (Phase P2)

- **Settlement idempotency:** call `poker_settle_hand(hand_id, …)` twice → coins applied once, second returns `settled:false` (`COIN-IDEMPOTENCY-001`/`B1`, EC-D9/H10).
- **Conservation at DB level:** post-settlement `Σ stack credits == pot`; ledger rows sum correctly (`POT-CONSERVE-001`).
- **Escrow round-trip:** `poker_sit_down` then `poker_stand_up` conserves `wallet + stack` total (`B3`, EC-F8).
- **Bounds:** sit-down rejects buy-in outside 40–100 BB and wallet < entry gate (`BUYIN-MIN/MAX-001`/`ENTRY-GATE-001`, EC-F1/F2).
- **Top-up next-hand:** `poker_top_up` doesn't change current-hand stack; applies at HAND_COMPLETED (`TOPUP-001`, EC-F3).
- **Race safety:** concurrent settlement / concurrent seat actions under `FOR UPDATE` produce one consistent result, no deadlock (`B5`, EC-I4).
- **Policy-leak assertions (🔴):** as an `anon`/`authenticated` client —
  - `SELECT` on `poker_deck` returns **0 rows / denied** (no SELECT policy, `A2`, EC-E6).
  - `SELECT` on `poker_hole_cards` returns **only own** rows (`A1`, EC-E6).
  - `INSERT/UPDATE/DELETE` on `poker_tables`/`poker_seats`/`poker_hands`/`poker_hole_cards` are **denied** (no client write policy, `C1`, EC-H4).
  - `poker_settle_hand`/`poker_refund_hand` are **not executable** by `anon`/`authenticated` (REVOKE, `C3`).

---

## 4. Server-action tests (Phase P3)

- `pokerAct` rejects: not-your-turn, illegal action for the situation, amount out of bounds, expired deadline, stale `state_version`, foreign user id (`C2`/`C4`, EC-H2/H3/H5).
- **Payload privacy (🔴):** `fetchTableState` and `pokerAct` returns contain **no** other player's un-revealed hole cards and **no** deck card; assert the exact public shape ([realtime-model §5](../architecture/realtime-model.md)) (`A1`/`A3`, EC-E1–E5).
- Board reveal: flop/turn/river cards appear in the public row **only** at street entry; never earlier (`A3`/`SHOWDOWN-PRIVATE-001`, EC-E5).
- Failed commit leaves state unchanged and turn not advanced; safe retry (`FAIL-NOADVANCE-001`, EC-H5); duplicate action applies once (`ACTION-IDEMPOTENT-001`, EC-H1).
- Full hand playable end-to-end via action calls (integration) with conservation + privacy asserted throughout.
- Lifecycle: leave mid-hand settles after the hand (`LEAVE-001`, EC-F4); 3 timeouts → sit-out (`TIMEOUT-SITOUT-001`, EC-F6); bust→rebuy (`BUST-001`, EC-F7); pre-deal abort refunds (`CANCEL-REFUND-001`, EC-H8).

---

## 5. Realtime tests (Phase P4 — Playwright)

- **Watchdog recovery (🔴 flow):** two browsers; player A acts; drop player B's socket; assert B's table reconciles to the new state **without a manual refresh** (`D1`, EC-I1/H7).
- Stale/duplicate event dropped via `state_version`; idempotent reducer (`D4`/`FSM-INV-003`, EC-I2).
- `TOKEN_REFRESHED` does not drop the subscription; `setAuth` keeps RLS context (`D2`, EC-I3).
- Reconnect mid-hand resumes seat, re-fetches own hole cards, clock kept running (`RECONNECT-001`, EC-G4).
- Spectator receives public-only payload throughout a full hand (`EC-E4`).
- Animation completion never changes authoritative state (`D3`, EC-I5).

---

## 6. Responsive / UI tests (Phase P5)

- Layout matrix: desktop 16:9 (1672×941), tablet 4:3 (1448×1086), mobile **landscape** 16:9 — seats/board/pot/controls within safe areas for 2–6 players ([../ui/visual-responsive-specification](../ui/visual-responsive-specification.md)).
- Portrait → polished **rotate-device** screen; no gameplay squeezed into portrait.
- Long usernames truncate; large stacks use `formatCoinsShort`; multiple side-pots render distinctly.
- Reduced-motion honored; sound toggle works; touch targets meet the minimum.

---

## 7. i18n tests (Phase P7)

- `npm run i18n:check` passes for the `poker` namespace across `vi/en/ja/ko/zh` (`F2`).
- No hardcoded UI string (manual + grep review, CLAUDE.md §6).

---

## 8. Rule-ID coverage map (gate)

Each row's primary rule IDs must have ≥1 referenced test before its phase ships. Coverage tracked in a simple table (rule ID → test name) maintained alongside the suites:

| Domain | Must-cover IDs | Suite |
| --- | --- | --- |
| Hand eval | `HAND-RANK-001`, `HAND-TIE-001`, `HAND-EXACT-TIE-001`, `HAND-STRAIGHT-WHEEL/WRAP-001`, `HAND-USE-001` | `evaluator.test.ts` |
| Betting | `ACTION-CHECK-001`, `BET-MIN-001`, `RAISE-MIN-001`, `RAISE-FULL-001`, `ALLIN-SHORT/CUMULATIVE/REOPEN/NOREOPEN/CALLSHORT-001` | `betting.test.ts` |
| Button/blinds | `BLIND-001`, `BLIND-HEADSUP-001/-POSTFLOP-001`, `BUTTON-HEADSUP-INTO/OUTOF-001`, `BLIND-DEADBTN-001`, `BLIND-SHORT-001` | `engine.test.ts` |
| Pots | `POT-MAIN/SIDE-001`, `POT-INDEP-001`, `POT-SPLIT-001`, `POT-ODD-001`, `POT-UNCALLED-001`, `POT-ELIG-001`, `POT-CONSERVE-001` | `pot.test.ts` |
| Showdown/privacy | `SHOWDOWN-MUCK/REVEAL/ORDER-001`, `SHOWDOWN-PRIVATE-001`, `SECURITY-HOLE-CARDS-001` | engine + actions + realtime |
| Coins | `COIN-INT-001`, `COIN-IDEMPOTENCY-001`, escrow RPCs | pot + DB/RPC |
| Authority | `C1`–`C5`, `FSM-INV-003`, `ACTION-IDEMPOTENT-001` | DB/RPC + actions |
| Realtime | `D1`–`D4`, `RECONNECT-001` | realtime |
| Lifecycle | `LEAVE-001`, `TOPUP-001`, `TIMEOUT-CHECK/FOLD/SITOUT-001`, `BUST-001`, `CANCEL-REFUND-001` | actions |

---

## 9. Release gate checklist (all must be green)

- [ ] Engine unit suites (`evaluator`/`betting`/`pot`/`engine`/`qa-acceptance`) pass.
- [ ] Side-pot conservation property test passes over randomized seeds (`POT-CONSERVE-001`).
- [ ] Settlement double-call applies once (`COIN-IDEMPOTENCY-001`).
- [ ] Policy-leak assertions: deck unreadable, hole cards read-own, no client writes, settle/refund REVOKEd.
- [ ] Payload privacy asserted on every action + realtime payload (no foreign hole/deck cards).
- [ ] Realtime watchdog recovers a dropped update without manual refresh.
- [ ] Responsive matrix (desktop/tablet/mobile-landscape) + portrait rotate screen.
- [ ] `npm run typecheck`, `npm run lint`, `npm run i18n:check` clean.
- [ ] Abandoned mid-hand table resolves once, coins conserved.
