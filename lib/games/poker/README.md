# Poker — pure domain & engine area (`lib/games/poker`)

**Status: pure rules engine (Phase P1) complete.** This directory holds the **type-only domain**,
the **typed event layer**, and the **pure, deterministic rules engine** (deck / evaluator /
betting / pot / order / showdown / engine). There is still **no DB, no server, no UI** — those
arrive in later phases (see `docs/poker/03-implementation-roadmap.md`). Nothing here is wired into
the games registry or any production route, so no incomplete gameplay is exposed. The engine
imports only `lib/games/shared` + `./types` — no React, no Supabase, no browser API, no clock.

## Module boundary

Poker follows the repository's existing flat per-game convention (mirrors `lib/games/tlmn`),
not an invented folder tree. The architecture separates concerns by **location**, not by deep
nesting (see `docs/poker/architecture/system-architecture.md` §3):

| Concern | Location | Status |
| --- | --- | --- |
| **domain / types** | `lib/games/poker/types.ts` | ✅ foundation (this phase) |
| **realtime events** | `lib/games/poker/events.ts` (on `lib/games/shared`) | ✅ foundation (this phase) |
| **engine** (deck, evaluator, betting, pot, order, showdown, engine) | `lib/games/poker/*.ts` | ✅ Phase P1 (99 unit tests) |
| **persistence / schema** | `supabase/migration_poker_*.sql` | ⏳ Phase P2 |
| **server** (authoritative actions, validation) | `app/games/poker/actions.ts` (`'use server'`) | ⏳ Phase P3 |
| **realtime client** | `app/games/poker/[tableId]/usePokerRealtime.ts` | ⏳ Phase P4 |
| **UI** | `app/games/poker/**` | ⏳ Phase P5 |
| **i18n** | `messages/*.json` `poker` namespace ×5 | ⏳ later |
| **tests** | co-located `*.test.ts` (`node --test`) + `e2e/poker` | ongoing |

## Architecture rules enforced by this boundary

- **No Poker rules inside React components** — rules live in `lib/games/poker` (pure).
- **No database client inside pure engine modules** — `lib/games/poker/*` never imports
  Supabase. Only `app/games/poker/*` does.
- **No browser dependency inside pure domain logic** — these modules import only
  `lib/games/shared` (also pure) and `node:`-free code.
- **No direct wallet mutation from UI** — coins move only via SECURITY DEFINER RPCs (P2).
- 🔴 **No private data in a shared/public type.** `HoleCards` is private; the public
  projection `PublicTableState` exposes cards only via `board` (revealed streets) and
  `reveal` (non-mucking showdown). `events.ts#assertSpectatorSafe` structurally rejects any
  other card-bearing field before an event can be emitted (security-model §2).

## Depends on

`lib/games/shared` (pure platform infra) — event envelope, state-version reasoning, integer
coin helpers, deadlines, subscription lifecycle. See `lib/games/shared/README.md`.
