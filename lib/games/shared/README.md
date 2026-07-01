# Shared multiplayer-game infrastructure (`lib/games/shared`)

PURE, framework-free primitives reused by every **authoritative** multiplayer game on the
platform. **No React, no Supabase, no browser-only API** — safe to import from a pure engine,
a `'use server'` action, or a client component.

This layer is the deliberate seam between **shared platform**, **existing game logic** (TLMN,
Caro, Chess), and **new game logic** (Poker). It does not change any existing game — it is
additive. Poker is its first consumer; other games may adopt it incrementally.

## Modules

| File | Purpose | Tested by |
| --- | --- | --- |
| `ids.ts` | `EventId` + `makeEventId`; deterministic `makeIdempotencyKey` / `makeActionKey` (duplicate-command collapse, coin-model §4) | `ids.test.ts` |
| `sequence.ts` | Monotonic `state_version` / action-seq reasoning: `compareVersion`, `isStaleVersion`, `isDuplicateVersion`, `isVersionGap`, `reconcileDecision`, `shouldApplySnapshot` (realtime-model §2) | `sequence.test.ts` |
| `coins.ts` | Safe **integer** coin arithmetic: `assertCoin`, `addCoins`, `subCoins`, `sumCoins`, `splitInteger`, `isConserved` (coin-model §6, COIN-INT-001) | `coins.test.ts` |
| `deadline.ts` | Server-authoritative deadlines + display: `computeDeadline`, `remainingMs`, `isExpired` (with grace), `formatTurnClock` (realtime-model §7) | `deadline.test.ts` |
| `envelope.ts` | Typed `GameEventEnvelope` + `createEnvelope`/`isValidEnvelope` + `EnvelopeDedupe` (security-model D4) | `envelope.test.ts` |
| `transport.ts` | Realtime transport **contract** + `SubscriptionRegistry` (leak-free cleanup) + presence contract (realtime-model §1/§4/§8) | `transport.test.ts` |
| `contracts.ts` | Type-only capability contracts (identity, profile, lobby, room/seat, snapshot, wallet, ledger, chat, notification, prefs) + `buildAuditRecord` | typecheck |

## Hard boundary rules

1. **No private data in shared/public types.** Every snapshot/profile/event type is a PUBLIC
   projection. A player's own cards are fetched through a **separate** read-own path
   (`PrivateStateFetch`) and are never a field on a shared type
   (security-model `SECURITY-HOLE-CARDS-001`).
2. **The event envelope never carries a secret.** It may only *name* recipients who should
   re-fetch their own private state (`privateRecipients: string[]`).
3. **Integer coins only.** All coin math goes through `coins.ts`; no floating point
   (`COIN-INT-001`). These helpers are pure — they never mutate a wallet; authoritative coin
   movement happens only in SECURITY DEFINER RPCs.
4. **Realtime is sync, not authority.** `sequence.ts` decides apply/drop/reconcile; the
   authoritative row is always the source of truth.
5. **Pure only.** If a module needs React or Supabase, it does not belong here — it belongs in
   the game's `app/games/<game>/` area, depending on these contracts.

## Existing implementations these contracts point at (reused, not rebuilt)

- Identity: `lib/supabase/server.ts` (`auth.getUser`) + `lib/userIdentity.ts`.
- Wallet/ledger: `lib/game/economy.ts` + `supabase/migration_tlmn_run7_economy.sql`.
- Realtime transport: Supabase Realtime via the anon **singleton** `lib/supabase/client.ts`.
- Sound singleton pattern: `app/games/tlmn/[roomCode]/useTlmnSound.ts`.
