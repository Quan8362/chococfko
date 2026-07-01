# Poker Foundation — Shared Boundaries

**Status:** Implemented (foundation phase). Companion to [system-architecture](system-architecture.md),
[realtime-model](realtime-model.md), [security-model](security-model.md), [coin-model](coin-model.md).

This phase implements the **minimum clean foundation** required before any Poker rules, DB, or
UI exist. It establishes three clearly separated layers and the contracts between them. **No
existing game (TLMN, Caro, Chess, …) is modified; no production UI is wired; no migration is
run; no production data is touched.**

---

## 1. The three layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SHARED platform infra        lib/games/shared/  (PURE — no React/Supabase)   │
│   ids · sequence · coins · deadline · envelope · transport · contracts        │
│   Reusable by every authoritative multiplayer game.                           │
└───────────────┬───────────────────────────────────┬───────────────────────────┘
                │ depends on                         │ depends on
┌───────────────▼─────────────────────┐  ┌───────────▼───────────────────────────┐
│ EXISTING game logic                  │  │ NEW Poker game logic                   │
│   lib/games/tlmn, lib/caro, …        │  │   lib/games/poker/ (PURE domain+events)│
│   UNCHANGED — may adopt shared later │  │   app/games/poker/ (later phases)      │
└──────────────────────────────────────┘  └────────────────────────────────────────┘
```

- **Shared** owns cross-game primitives only (ordering, dedupe, integer coins, deadlines,
  realtime contracts). It never imports a specific game.
- **Existing games** are untouched. The shared layer is **additive**; TLMN/Caro continue to
  use their own helpers and can migrate onto shared primitives incrementally if ever desired.
- **Poker** (`lib/games/poker`) is pure domain + events that depend only on `lib/games/shared`.
  Server/UI for Poker live under `app/games/poker` and are built in later phases.

---

## 2. Shared module map (`lib/games/shared`)

| Module | Provides | Spec anchor |
| --- | --- | --- |
| `ids.ts` | `EventId`/`makeEventId`; deterministic `makeIdempotencyKey`, `makeActionKey` | coin-model §4 (`ACTION-IDEMPOTENT-001`) |
| `sequence.ts` | `compareVersion`, `isStaleVersion`, `isDuplicateVersion`, `isVersionGap`, `reconcileDecision`, `shouldApplySnapshot` | realtime-model §2 (`C4`, `EC-H2`, `D4`) |
| `coins.ts` | integer-only `assertCoin`/`addCoins`/`subCoins`/`sumCoins`/`splitInteger`/`isConserved` | coin-model §6 (`COIN-INT-001`, `POT-ODD-001`, `POT-CONSERVE-001`) |
| `deadline.ts` | `computeDeadline`, `remainingMs`, `isExpired` (grace), `formatTurnClock` | realtime-model §7 (`RECONNECT-001`) |
| `envelope.ts` | `GameEventEnvelope`, `createEnvelope`/`isValidEnvelope`, `EnvelopeDedupe` | realtime-model §5, security-model `D4` |
| `transport.ts` | `RealtimeTransport`/`PresenceTracker` contracts, `SubscriptionRegistry` (leak-free cleanup), `ConnState` | realtime-model §1/§4/§8, CLAUDE.md §12 |
| `contracts.ts` | type-only capability contracts (identity, profile, lobby, room/seat, snapshot, wallet, ledger, chat, notification, prefs) + `buildAuditRecord` | system-architecture §1 reuse list |

All pure, all unit-tested with `node --test` (except type-only `contracts.ts`, covered by the
typecheck).

---

## 3. Poker module map (`lib/games/poker`)

| Module | Provides | Status |
| --- | --- | --- |
| `types.ts` | `Card`/`Rank`/`Suit`/`HoleCards`, `Street`/`HandPhase`, `PokerAction`, `PublicSeat`, `Pot`/`Payout`, `PublicTableState`, `MyHoleCardsState` | type-only foundation |
| `events.ts` | `PokerEvent` (shared envelope instantiation), `createPokerEvent`, `assertSpectatorSafe` privacy guard | foundation |
| `README.md` | the per-game boundary + phase status | — |

Engine (`deck`/`evaluator`/`betting`/`pot`/`engine`), schema, server actions, realtime client,
and UI are **explicitly not built yet** (roadmap P1–P5).

---

## 4. Invariants the foundation guarantees

1. **Privacy is structural.** No shared/public type has a private-card field. The event
   envelope can only *name* recipients (`privateRecipients: string[]`) — never carry cards.
   `assertSpectatorSafe` rejects any forbidden field before an event is emitted, and a
   first-class test asserts it (`events.test.ts`). (security-model `SECURITY-HOLE-CARDS-001`.)
2. **Realtime is sync, not authority.** `reconcileDecision` drops stale/duplicate events and
   triggers a snapshot reconcile on a gap; the authoritative row is always truth.
3. **Integer coins only.** Every coin operation goes through `coins.ts`, which rejects
   non-integers and overflow. No floating point. (No wallet is mutated here — pure math only.)
4. **Idempotency vocabulary.** Deterministic keys collapse duplicate commands to one effect.
5. **No leaked subscriptions.** `SubscriptionRegistry` makes "everything was unsubscribed" a
   unit-testable fact.
6. **Purity.** `lib/games/shared` and `lib/games/poker` import no React and no Supabase, so
   they run under `node --test` and can be reused from server or client without a browser
   dependency.

---

## 5. What this phase explicitly does NOT do

- No Poker rules / hand evaluation / betting logic (P1).
- No database tables, RLS, or RPCs; no migration applied (P2).
- No server actions; no realtime client; no UI (P3–P5).
- No change to `app/games/page.tsx`, no `messages/*.json` poker namespace, no asset rename.
- No commit, push, or deploy.
