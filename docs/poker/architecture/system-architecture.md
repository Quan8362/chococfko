# Poker System Architecture — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [security-model](security-model.md), [realtime-model](realtime-model.md), [coin-model](coin-model.md), the [rules specs](../rules/), and the grounding audit [../01-preflight-audit](../01-preflight-audit.md) + [../02-reuse-matrix](../02-reuse-matrix.md) + [../03-implementation-roadmap](../03-implementation-roadmap.md).

> **Prime directive.** The **server + Postgres are the only authoritative source of game state.** The browser sends **intent** only — it never decides cards, winners, pot values, legal actions, turn order, stack changes, or settlement. This document defines the components, the data flow, the database ownership boundaries, and the module layout that enforce that directive.

---

## 1. Layered overview

```
┌──────────────────────── BROWSER (Client Components) ────────────────────────┐
│ PokerLobby / PokerTable / PokerSeat / BetControls / usePokerRealtime         │
│  • Realtime subscribe via anon SINGLETON (lib/supabase/client.ts)            │
│      → reads PUBLIC rows only                                                 │
│  • fetchMyHoleCards (anon, RLS read-own) → own private cards only            │
│  • Caro-grade recovery watchdog + monotonic state_version reconcile          │
│  • Sends INTENT to server actions: { tableId, action, amount? }              │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ 'use server' action calls (Next.js App Router)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ SERVER (app/games/poker/actions.ts — 'use server')                            │
│  1. identity = auth.getUser()  (lib/supabase/server.ts, cookie client)        │
│  2. re-read authoritative state (service role)                                │
│  3. validate seat / turn / legal action / amount / deadline / state_version   │
│  4. PURE ENGINE (lib/games/poker) computes next state + payouts               │
│  5. service-role writes public state + private hole cards (admin client)      │
│  6. SECURITY DEFINER RPCs for coin escrow + settlement (idempotent)           │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ POSTGRES (Supabase)                                                           │
│  • RLS: public rows SELECT(true); private rows SELECT-own; deck NO policy     │
│  • NO client write policy on any poker table (service-role writes only)       │
│  • Realtime publication: PUBLIC tables only (hole cards / deck NEVER)         │
│  • SECURITY DEFINER coin RPCs (FOR UPDATE, idempotent, coin_ledger)           │
└───────────────────────────────────────────────────────────────────────────────┘
                │ scheduled
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ CRON / REAPER (app/api/cron/poker-maintenance) + lobby-load nudge             │
│  • Safely settle/refund escrow on abandoned tables; advance stalled clocks    │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Shared with the platform (reuse as-is):** the four Supabase client factories, Supabase Auth + `AuthSync`, `getUserIdentity`/`UserAvatar`, the `game_wallets`/`coin_ledger` substrate, `lib/game/economy.ts` constants/formatters, `coinTier` badge, the game registry in `app/games/page.tsx`, `next-intl` 5-locale i18n, the `useTlmnSound` singleton pattern, the cron+reaper skeleton, and the `node --test`/Playwright tooling. **Poker owns everything game-specific.**

---

## 2. The four Supabase client factories (roles are load-bearing)

| Factory | File | Auth | Poker use |
| --- | --- | --- | --- |
| `createClient()` (browser singleton) | [lib/supabase/client.ts](../../../lib/supabase/client.ts) | anon + user cookie | Realtime subscriptions; **RLS-guarded read of OWN hole cards only** |
| `createClient()` (SSR cookie) | [lib/supabase/server.ts](../../../lib/supabase/server.ts) | anon as `auth.uid()` | Resolve identity; call **player-facing** SECURITY DEFINER RPCs |
| `createAdminClient()` (service role) | [lib/supabase/admin.ts](../../../lib/supabase/admin.ts) | service role (bypasses RLS) | **All authoritative game-state writes** + trusted `poker_settle_hand`. **Never imported into a Client Component.** |
| `createPublicClient()` (cookie-free anon) | [lib/supabase/public.ts](../../../lib/supabase/public.ts) | anon | Cache-safe public lobby lists (`unstable_cache`) |

Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is **server-only** and never reaches the browser (`C5`).

---

## 3. Module layout (proposed — built in later phases)

```
lib/games/poker/                  # PURE — no React, no Supabase imports
  types.ts        # Card, Rank, Suit, Seat, HandState, Action, Pot, Payout
  deck.ts         # 52-card model + seeded CSPRNG Fisher–Yates shuffle (DECK-001/SHUFFLE-001)
  evaluator.ts    # best-5-of-7 ranking + total-order compare (HAND-RANK-001/HAND-TIE-001)
  evaluator.test.ts
  betting.ts      # legal-action set, min-raise, reopening (ACTION-*/RAISE-*/ALLIN-*)
  betting.test.ts
  pot.ts          # integer main/side-pot allocation, odd-chip, uncalled refund (POT-*)
  pot.test.ts
  engine.ts       # orchestrates a hand: deal→streets→showdown→payouts (deterministic)
  engine.test.ts
  qa-acceptance.test.ts
  bot.ts          # (later phase, out of v1 ship scope) — no bots in v1

app/games/poker/
  page.tsx                 # lobby (server entry)
  actions.ts               # ALL 'use server' authoritative actions
  wallet.ts                # thin Poker-specific wallet view wrappers (reuse game_wallets)
  PokerLobby.tsx
  PokerWaitingRooms.tsx    # public table list (mirrors TLMN/Caro waiting rooms)
  [tableId]/
    page.tsx
    PokerTable.tsx         # board, pot, seats, bet UI (client)
    PokerSeat.tsx
    PokerCard.tsx
    BetControls.tsx
    usePokerSound.ts       # module-level singleton AudioContext (copy useTlmnSound pattern)
    usePokerRealtime.ts    # Caro-grade watchdog + state_version reconcile

app/api/cron/poker-maintenance/route.ts   # reaper

supabase/migration_poker_*.sql            # applied MANUALLY, one per phase, in order

e2e/poker/                                 # Playwright (mirrors e2e/tlmn)
```

The **engine is pure and fully unit-tested before any DB/UI exists** (Phase P1) — fastest, safest place to nail the rules.

---

## 4. Database ownership boundaries

All tables are `public.*`. Every poker table follows the strict posture (the explicit correction of TLMN's loose `tlmn_rooms`/`tlmn_seats` RLS — see [../02-reuse-matrix §3](../02-reuse-matrix.md)).

| Table | Visibility | Client writes | Realtime | Secrets |
| --- | --- | --- | --- | --- |
| `poker_tables` | public room metadata (`SELECT(true)`) | **NO** (service-role only) | yes | password **hash only**, never plaintext |
| `poker_seats` (incl. `stack`) | public (`SELECT(true)`) | **NO** | yes | none (stack is public) |
| `poker_hands` (board, pot, side-pots, street, turn, `turn_deadline`, `state_version`, reveal field) | public (`SELECT(true)`) | **NO** | yes | **must never** hold un-turned board or any hole card |
| `poker_hole_cards` (seat ↔ 2 cards) | **RLS read-own** (`USING (user_id = auth.uid())`) | **NO** | **NOT published** | own hole cards |
| `poker_deck` (shuffled stub + burn + deal pointer) | **server-only — NO SELECT policy at all** | **NO** | no | all undealt/future cards |
| `poker_actions` (per-action audit log) | public or read-own (type + amount, **no cards**) | **NO** | optional | none |
| `poker_hand_settlements` (idempotency lock, PK `hand_id`) | no policies (opaque) | **NO** | no | none |
| `game_wallets` / `coin_ledger` | **REUSE** (RLS read-own) | **NO** | no | none |

**Hard boundaries (`C1`/`A1`/`A2`):**
1. **No game-state table gets a client write policy.** All writes go through `'use server'` actions (service role) or SECURITY DEFINER RPCs.
2. **The deck table has no SELECT policy at all** — not even read-own — so no client can read undealt cards.
3. **Only PUBLIC tables join the `supabase_realtime` publication.** `poker_hole_cards` and `poker_deck` are never published.
4. **Every coin movement** writes a `coin_ledger` row with `balance_after`, inside a `FOR UPDATE` + idempotent RPC.

A proposed primary-key/relationship sketch (final columns settled in P2): `poker_tables(id)` 1—N `poker_seats(table_id, seat_index)`; `poker_hands(id, table_id, hand_no, state_version, ...)`; `poker_hole_cards(hand_id, seat_index, user_id, cards)`; `poker_deck(hand_id, stub jsonb, deal_index)`; `poker_actions(id, hand_id, seat_index, street, type, amount, action_seq)`; `poker_hand_settlements(hand_id PK, settled_at, payouts jsonb)`.

---

## 5. Server actions (authoritative API surface)

All live in `app/games/poker/actions.ts` (`'use server'`). Each begins with `auth.getUser()` and **re-reads authoritative state** before validating. The browser passes intent only.

| Action | Intent | Server responsibilities |
| --- | --- | --- |
| `createTable(config)` | name, stakes (BB/SB), public/private(+password), capacity 2–6 | validate config; insert `poker_tables` (service role); hash password |
| `listTables()` / `fetchWaitingRooms()` | — | public list via `createPublicClient` (cache-safe) |
| `joinAsSpectator(tableId)` | — | grant public subscription only; never private payloads (`EC-E4`) |
| `sitDown(tableId, seatIndex, buyIn)` | seat + buy-in (40–100 BB) | validate buy-in range + entry gate; `poker_sit_down` escrow (wallet→stack) |
| `postBigBlindNow(tableId)` / `waitForBigBlind(tableId)` | — | set deal-in policy (`JOIN-POSTBB-001`/`JOIN-BB-001`) |
| `startHand(tableId)` | — | (auto/host) freeze seats, compute button, shuffle into server-only deck, post blinds, deal hole cards |
| `pokerAct(tableId, action, amount?)` | fold/check/call/bet/raise/all-in (+amount) | validate seat/turn/legal-set/amount/deadline/`state_version`; run engine; commit public+private; settle on hand end |
| `sitOut(tableId)` / `returnToSeat(tableId)` | — | seat-state transitions (effective per FSM) |
| `topUp(tableId, amount)` | add coins | escrow more; **active next hand** (`TOPUP-001`) |
| `standUp(tableId)` / `leaveTable(tableId)` | — | if mid-hand, queue until settlement (`LEAVE-001`); then `poker_stand_up` returns stack |
| `rebuy(tableId, amount)` | 40–100 BB | from BUSTED; escrow wallet→stack |
| `fetchTableState(tableId)` | — | **public** snapshot only (board revealed-streets, pots, seats, turn, deadline) |
| `fetchMyHoleCards(tableId)` | — | caller's own hole cards via anon RLS client (never others') |
| `tickActionTimer(tableId)` | — | clock nudge; applies timeout action if deadline passed (`TIMEOUT-001`) |

**Validation order for `pokerAct` (mirrors TLMN `playCards`, hardened):**
`auth.getUser()` → resolve my seat → load latest hand (service role) → assert `turn_seat === mySeat` → assert not expired (`turn_deadline`) → assert `state_version` matches client's last-seen (reject stale, `EC-H2`) → compute legal action set + amount bounds via engine → reject if illegal → apply engine transition → service-role commit (public row + own hole cards) with `state_version++` → on hand end call `poker_settle_hand` (idempotent) → return result. A failed commit does **not** advance the turn (`FAIL-NOADVANCE-001`).

---

## 6. SECURITY DEFINER RPCs (coin authority)

Defined fully in [coin-model](coin-model.md). Summary:

| RPC | Caller | Guarantees |
| --- | --- | --- |
| `poker_sit_down(table_id, seat_index, buy_in)` | player (auth.uid) | entry-gate + buy-in bounds; `FOR UPDATE` wallet; idempotent; `coin_ledger` row |
| `poker_stand_up(table_id, seat_index)` | server/player | return remaining stack to wallet; idempotent; ledgered |
| `poker_rebuy/top_up(...)` | player | `FOR UPDATE`; bounds-checked; ledgered; top-up active next hand |
| `poker_settle_hand(hand_id, payouts jsonb)` | **service role only** | idempotent via `poker_hand_settlements(hand_id)`; `FOR UPDATE` per seat; integer payouts summing exactly to pot (`POT-CONSERVE-001`) |
| `poker_refund_hand(hand_id)` | service role only | idempotent refund of all contributions on CANCELLED / admin-resolved freeze |

All are `REVOKE`d from `anon`/`authenticated` except the strictly `auth.uid()`-scoped player RPCs, which are `GRANT`ed to `authenticated` only — mirroring `settle_round` vs `ensure_wallet`/`get_wallet`/`claim_daily_coins` in [migration_tlmn_run7_economy.sql](../../../supabase/migration_tlmn_run7_economy.sql).

---

## 7. Data flow — one action, end to end

1. **Player clicks Raise to X** → client `usePokerRealtime` calls `pokerAct(tableId, 'raise', X)` (intent only; identity not sent).
2. **Server** resolves `auth.uid()`, re-reads the hand (service role), validates seat/turn/legal/amount/deadline/`state_version`.
3. **Engine** (`lib/games/poker`) computes the new betting state (new highest bet, last-full-raise size, next actor) — pure, integer.
4. **Service role** writes the new **public** `poker_hands` row (`state_version++`, new `turn_deadline`) and appends a `poker_actions` audit row. Hole cards untouched.
5. **Realtime** publishes the `poker_hands` change on channel `poker:${tableId}`. `poker_hole_cards`/`poker_deck` are **not** published.
6. **Every client** receives the public change, reconciles by `state_version` (drop stale/dupes), and re-fetches **its own** hole cards via the anon RLS client — opponents' cards never traverse the wire (`A1`).
7. **On hand end**, the server computes payouts and calls `poker_settle_hand` (idempotent). The final public row carries winners + any revealed cards.

---

## 8. Registry, i18n, assets, cron (integration points)

- **Game registry:** add one row to `GAMES[]` + one icon in `ICONS` in [app/games/page.tsx](../../../app/games/page.tsx). Additive.
- **i18n:** add a `poker` namespace to **all five** `messages/{vi,en,ja,ko,zh}.json`; run `npm run i18n:check` (`F2`). Zero hardcoded UI strings (CLAUDE.md §6).
- **Assets:** `public/pocker_*.webp` → rename to `poker-{desktop,tablet,mobile}.webp` **in the same change that first references them** (Phase P5; safe — untracked, zero references). See [../ui/visual-responsive-specification](../ui/visual-responsive-specification.md).
- **Cron:** add `/api/cron/poker-maintenance` to [vercel.json](../../../vercel.json) (or extend); the **lobby-load nudge is the real workhorse** because the minute cron is throttled in practice (memory `tlmn-abandoned-match-reaper`).

---

## 9. Non-functional requirements

- **Authority:** no client decides state (`C1`–`C4`).
- **Privacy:** hole cards + deck never reach a client that shouldn't see them (`A1`/`A2`/`SECURITY-HOLE-CARDS-001`).
- **Integrity:** integer coins, idempotent + conserved settlement (`COIN-INT-001`, `COIN-IDEMPOTENCY-001`, `POT-CONSERVE-001`).
- **Resilience:** Caro-grade realtime recovery (`D1`); safe escrow on abandonment (`E1`).
- **Auditability:** every action logged; every hand replayable (`ENGINE-REPLAY-001`).
- **Determinism:** engine is pure + seeded (`ENGINE-DETERMINISM-001`).
- **Deploy safety:** migrations applied manually, one per phase, in order; code calling a new RPC never deploys before the RPC exists (`E3`); deploy only via push to `main` (`E4`, memory `deploy-infrastructure`).

---

## 10. Explicit non-goals (v1)

No rake, ante, straddle, tournaments, bots, run-it-twice, insurance, rabbit hunt, bomb pot, multi-board, real-money anything (`RAKE-NONE-001`, `NOEXTRA-001`, `NOFEATURE-001`). Portrait gameplay is **not** supported — a polished rotate-device screen is shown instead (see UI spec).
