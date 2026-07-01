# Poker Implementation Roadmap — Chợ Cóc FKO

**Date:** 2026-06-30 · Companion to [01-preflight-audit](01-preflight-audit.md) and [02-reuse-matrix](02-reuse-matrix.md).
**Game:** No-Limit Texas Hold'em (NLHE), play-money "xu" only (zero monetary value, no purchase/cashout).

Guiding rule for every phase: **the server + database are the only authoritative source of state; the browser sends intent and never decides cards, pot, stacks, winners, legal actions, or turn order.**

---

## 1. Recommended shared-game architecture

```
                        Browser (Client Components)
   ┌───────────────────────────────────────────────────────────────┐
   │  Realtime subscribe (anon singleton)  ── reads PUBLIC state    │
   │  fetch own hole cards (anon, RLS read-own) ── private          │
   │  recovery watchdog + monotonic state_version (Caro-grade)      │
   │  calls 'use server' actions with INTENT only {tableId,action} │
   └───────────────┬───────────────────────────────────────────────┘
                   │ server action ('use server')
   ┌───────────────▼───────────────────────────────────────────────┐
   │  Identity = auth.uid() (cookie client)                         │
   │  Validate seat / turn / legal action / amount / deadline       │
   │  Pure NLHE engine (lib/games/poker) computes next state        │
   │  Service-role writes: public state + private hole cards        │
   │  SECURITY DEFINER RPCs: escrow, settle (idempotent, FOR UPDATE)│
   └───────────────┬───────────────────────────────────────────────┘
                   │
   ┌───────────────▼───────────────────────────────────────────────┐
   │  Postgres  ── RLS: public rows SELECT(true), private SELECT-own │
   │  Deck = server-only (NO select policy). No client write policy. │
   │  Realtime publication: PUBLIC tables only.                      │
   └───────────────────────────────────────────────────────────────┘
```

Shared with the rest of the platform: Supabase clients, auth/identity, `game_wallets`/`coin_ledger`, coin-tier badge, game registry, i18n, sound singleton, cron + reaper skeleton. **Poker owns everything game-specific.**

---

## 2. Proposed Poker folder & module structure

```
lib/games/poker/                 # PURE — no React, no Supabase
  deck.ts                        # 52-card model, CSPRNG shuffle
  evaluator.ts                   # 5-of-7 hand ranking
  evaluator.test.ts
  betting.ts                     # betting state machine, legal actions, min-raise
  betting.test.ts
  pot.ts                         # pot + side-pot integer allocation
  pot.test.ts
  engine.ts                      # orchestrates a hand: deal→streets→showdown
  engine.test.ts
  types.ts                       # shared types (Card, Seat, HandState, Action)
  bot.ts                         # (later phase) bot policy
  qa-acceptance.test.ts          # end-to-end rule acceptance

app/games/poker/
  page.tsx                       # lobby (server entry)
  actions.ts                     # all 'use server' actions (authoritative)
  wallet.ts                      # thin wrappers if Poker-specific wallet views needed
  PokerLobby.tsx
  PokerWaitingRooms.tsx
  [tableId]/
    page.tsx
    PokerTable.tsx               # board, pot, seats, bet UI (client)
    PokerSeat.tsx
    PokerCard.tsx
    BetControls.tsx
    usePokerSound.ts             # singleton pattern from useTlmnSound
    usePokerRealtime.ts          # Caro-grade watchdog + version guard

app/api/cron/poker-maintenance/route.ts   # reaper (or extend existing)

supabase/migration_poker_*.sql             # applied MANUALLY (see CLAUDE.md/memory)

e2e/poker/                                  # Playwright, mirrors e2e/tlmn
```

---

## 3. Proposed database ownership boundaries

| Table | Visibility | Client writes? | Realtime? | Holds secrets? |
| --- | --- | --- | --- | --- |
| `poker_tables` | public room metadata | **NO** (service-role only) | yes | no |
| `poker_seats` (incl. `stack`) | public | **NO** | yes | no (stack is public) |
| `poker_hands` (board, pot, street, turn, `state_version`) | public | **NO** | yes | **must never** contain un-turned board or hole cards |
| `poker_hole_cards` | **RLS read-own** | **NO** | **NOT published** | yes (own only) |
| `poker_deck` / undealt stub + burn | **server-only, NO select policy** | **NO** | no | yes (future cards) |
| `poker_actions` (bet/fold audit log) | public or read-own | **NO** | optional | no |
| `poker_hand_settlements` (idempotency lock) | RLS, no policies (opaque) | **NO** | no | no |
| `game_wallets` / `coin_ledger` | **reuse** (RLS read-own) | **NO** | no | no |

**Hard boundaries:**
1. **No game-state table gets a client write policy.** All writes are service-role inside `'use server'` actions / SECURITY DEFINER RPCs. (This is the explicit correction of the loose `tlmn_rooms`/`tlmn_seats` RLS — see [02-reuse-matrix §3](02-reuse-matrix.md).)
2. **The deck table has no SELECT policy at all** — not even read-own — so no client can ever read undealt cards.
3. **Only PUBLIC tables join the `supabase_realtime` publication.** `poker_hole_cards` and `poker_deck` are never published.
4. **Every coin movement** (escrow in, payout out, rake if any) writes a `coin_ledger` row with `balance_after`, inside a `FOR UPDATE` + idempotent RPC.

---

## 4. Implementation phases

Each phase ends with the standard report (summary, files changed, migrations/RLS/RPC/actions, tests, commands, results, manual verification, limitations, risks, next phase). **Migrations are applied manually by the maintainer** (per CLAUDE.md + memory `deploy-infrastructure`); phases must degrade safely before their migration is applied where feasible.

### Phase P0 — Preflight audit *(this phase — COMPLETE)*
Docs only. No code, no migration, no rename.

### Phase P1 — Pure NLHE engine (no DB, no UI)
- `lib/games/poker/{deck,evaluator,betting,pot,engine,types}.ts` + exhaustive `node --test`.
- Deliverable: a deterministic, integer-only engine that can play a full hand given seeded input, with side-pot correctness proven by tests.
- **No migration. No realtime. No coins.** Pure functions only — fastest, safest place to nail the rules.
- Gate: `evaluator`/`pot`/`betting` test suites green; known multiway all-in side-pot cases pass.

### Phase P2 — Schema + escrow + settlement (DB security spine)
- `migration_poker_schema.sql`: tables in §3 with **SELECT-scoped RLS, no client writes**, deck server-only, publication = public tables only.
- `migration_poker_economy.sql`: `poker_sit_down`/`poker_stand_up`/`poker_settle_hand` SECURITY DEFINER RPCs (FOR UPDATE, idempotent, ledger rows, REVOKE from clients). Reuse `game_wallets`.
- Tests: RPC idempotency + side-pot payout = pot invariant (SQL-level + engine-level).
- Gate: a hand settled twice applies coins once; escrow round-trips wallet↔stack with conserved totals.

### Phase P3 — Server actions + table state wiring
- `app/games/poker/actions.ts`: `createTable`, `sitDown`, `standUp`, `startHand`, `pokerAct(action, amount)`, `fetchTableState`, `fetchMyHoleCards`, `tickActionTimer`.
- Validation order mirrors TLMN `playCards`: `auth.getUser` → seat → turn → legal-action/amount → deadline → engine → service-role commit → settle on hand end.
- Deck dealt server-side; hole cards written to `poker_hole_cards`; board reveals written to public row only when turned.
- Gate: full hand playable via action calls in an integration test; **no select returns another player's hole cards or any deck card** (assert payload shape).

### Phase P4 — Realtime client (Caro-grade)
- `usePokerRealtime.ts`: subscribe to public tables; **recovery watchdog (timer + visibilitychange + online)**; **monotonic `state_version`** guard (drop stale/duplicate updates); `setAuth` on token refresh; malformed-state refetch; re-fetch own hole cards after each public update.
- `connState` UX (connecting/connected/reconnecting).
- Gate: scripted "act then drop opponent's socket" test proves the watchdog recovers state without a manual refresh (the exact failure `caro-realtime-sync` fixed).

### Phase P5 — Table UI
- `PokerTable.tsx` + board/pot/seats/bet-controls; landscape-locked mobile (1672×941 asset), tablet 4:3, desktop 16:9. Rename `pocker_*.webp`→`poker-*.webp` **here** (with the first code reference). Sound singleton. All-in/side-pot visualization.
- Gate: responsive Playwright matrix (desktop/tablet/mobile-landscape) like `e2e/tlmn/responsive.spec.ts`.

### Phase P6 — Turn clock + abandonment reaper
- Action clock (`turn_deadline`/`turn_started_at` + grace); timeout → fold/auto-check. Client-nudged `tickActionTimer` + `/api/cron/poker-maintenance`.
- Reaper **safely resolves escrowed stacks** on abandoned tables (refund or settle the live hand) — no coins stranded, no double-settle.
- Gate: abandoned mid-hand table resolves once, coins conserved, history preserved.

### Phase P7 — Bots, stats, social, polish, i18n & QA
- Optional Poker bot (TLMN sim scaffolding as template), stats/leaderboard, optional chat/emote (no secret on broadcast), i18n parity (5 locales) + `i18n:check`, full QA + e2e, accessibility/sound.
- Gate: `typecheck` + `lint` + `node --test` + e2e + `i18n:check` all green.

---

## 5. Test strategy

| Layer | Tooling | What it proves |
| --- | --- | --- |
| Engine (unit) | `node --test` over `lib/games/poker/*.test.ts` | Hand ranking, betting legality, **side-pot integer correctness**, min-raise, blind/button rotation. Pure & deterministic (seeded). |
| RPC / DB | SQL-level + integration tests | Idempotent settlement (double-call applies once), escrow conservation, FOR UPDATE race safety, **no policy leaks** (deck/hole-card selects denied to clients). |
| Server actions | integration | Validation rejects wrong-turn/illegal-amount/expired/another-user's-id; payloads never contain opponents' hole cards or deck. |
| Realtime | Playwright (`e2e/poker/realtime-*.spec.ts`) | Watchdog recovers from dropped updates; `state_version` rejects stale; reconnect restores. |
| Responsive | Playwright matrix | Desktop/tablet/mobile-landscape layouts. |
| i18n | `npm run i18n:check` | 5-locale parity. |
| Quality gates | `typecheck`, `lint` | Type + lint clean. (Note Windows `next build` ESLint-worker quirk — memory `tlmn-audit-harden`; rely on typecheck + CI build.) |

**Privacy assertion as a first-class test:** every server-action and realtime payload test must assert the absence of any other player's hole cards and any undealt deck card. This is the non-negotiable Poker invariant.

---

## 6. Asset integration strategy

- Keep names `pocker_*.webp` until Phase P5; **rename to `poker-{desktop,tablet,mobile}.webp` in the same change that first references them** (safe: untracked, zero references). Use `next/image` with art-directed `<source>`/responsive variants: desktop 16:9 (1672×941), tablet 4:3 (1448×1086), mobile **landscape** 16:9 (1672×941). Mobile table is landscape-locked (reuse memory `tlmn-seat-positioning` lessons: anchor seats to inner play-area %, avoid tying to chrome/PWA-banner).

---

## 7. Files likely to be modified later (outside new Poker files)

- [app/games/page.tsx](../../app/games/page.tsx) — add Poker to `GAMES[]` + `ICONS`.
- `messages/{en,ja,ko,vi,zh}.json` — add a `poker` namespace (×5).
- [vercel.json](../../vercel.json) — add `/api/cron/poker-maintenance` (or extend an existing cron).
- `public/pocker_*.webp` → renamed `poker-*.webp` (Phase P5).
- Possibly `lib/games/coinTier.ts` / `CoinTierBadge` usages (reuse, not modify).
- `e2e/` config if a shared Playwright project list is touched.

No existing TLMN/Caro/Chess/other-feature files need behavioral changes — Poker is additive.

---

## 8. Sequencing & safety notes

- **One migration per phase, applied manually, in order.** Never run a destructive migration; never `vercel --prod`/alias locally (memory `deploy-infrastructure`). Code that calls a new RPC must not deploy before that RPC's migration is applied (lesson from `caro-secure-moves`/`caro-join-rpc` ordering).
- **Degrade safely:** until P2's migration is applied, Poker routes should no-op/disable rather than error.
- **Do not commit/push/deploy** until the maintainer explicitly requests it.
