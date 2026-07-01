# Poker Realtime Model — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [system-architecture](system-architecture.md), [security-model](security-model.md), [../04-risk-register §D](../04-risk-register.md).

> **Realtime is for fast synchronization and notification, not authority.** The authoritative state lives in Postgres and is computed by the server. Realtime delivers *that* state quickly. A missed, duplicated, or out-of-order realtime event must **never** corrupt state — the client always reconciles against the authoritative row. Money-bearing betting cannot tolerate "you acted but I never saw it," so Poker adopts the **Caro-grade** hardened pattern from day one, **not** TLMN's nudge-polling (memory `caro-realtime-sync`; audit §6).

---

## 1. Channels & publication

- **One channel per table:** `poker:${tableId}`.
- **Published tables (PUBLIC only):** `poker_tables`, `poker_seats`, `poker_hands`, optionally `poker_actions`. Delivered via `postgres_changes`.
- **NEVER published:** `poker_hole_cards`, `poker_deck`. (Structural privacy — [security-model §2](security-model.md).)
- **Own hole cards** are **not** delivered via realtime at all. After every public update, each client **re-fetches its own** hole cards via the anon RLS client (`fetchMyHoleCards`). Opponents' cards never traverse the wire (`A1`).

The browser uses the **singleton** anon client (`lib/supabase/client.ts`) for the subscription, avoiding the JWT-refresh races that kill realtime (`D2`).

---

## 2. Monotonic `state_version` (the spine)

- `poker_hands.state_version` is a `bigint` that **strictly increases on every accepted authoritative transition** (each `pokerAct`, each street reveal, blinds, settlement).
- The client keeps `lastSeenVersion`. On each realtime payload it compares:
  - **`incoming.state_version > lastSeenVersion`** → apply, set `lastSeenVersion`.
  - **`incoming.state_version <= lastSeenVersion`** → **drop** (stale or duplicate). Idempotent reducer (`D4`, `EC-I2`).
  - **`incoming.state_version > lastSeenVersion + 1`** (gap detected) → a missed event; trigger a full **reconcile** (`fetchTableState`) rather than applying a partial jump.
- The server **rejects stale actions**: `pokerAct` includes the client's last-seen version and is rejected if the authoritative version has moved on (`C4`, `EC-H2`). Re-read authoritative state in every action.

This is the same guard Caro added (`caro-realtime-sync`: monotonic `state_version`).

---

## 3. Recovery watchdog (Caro-grade)

A missed `postgres_changes` event (transient socket drop, backgrounded tab, network blip) must self-heal **without a manual refresh**. The client runs a continuous watchdog with three triggers:

1. **Timer** — every ~12 s, if no update has arrived and it's plausibly "my turn" or the clock is near a deadline, run `fetchTableState` + re-fetch own hole cards and reconcile by `state_version`.
2. **`visibilitychange`** — when the tab returns to foreground, immediately reconcile (mobile/BFCache resume — the `AuthSync` lesson).
3. **`online`** — when the browser regains connectivity, reconcile.

On every `SUBSCRIBED` (initial + each resubscribe) the client does a full reconcile (`fetchTableState`). On `TOKEN_REFRESHED`, call `setAuth` so the subscription's RLS context stays valid (`D2`). On a **malformed/partial** payload (e.g., board array wrong length), force a refetch rather than rendering garbage (the Caro malformed-board guard).

This closes `D1`/`EC-I1` — the exact "opponent doesn't see the move until refresh" failure.

---

## 4. Connection-state UX

Mirror TLMN/Caro `connState`:

| State | Meaning | UI |
| --- | --- | --- |
| `connecting` | initial subscribe in flight | spinner / dim |
| `connected` | subscribed + reconciled | live |
| `reconnecting` | socket dropped, watchdog retrying | banner "reconnecting…", actions disabled until reconciled |
| `error` | persistent failure | banner + manual retry |

While `reconnecting`, the client **must not** let the player act on a possibly-stale snapshot; it reconciles first. The **server clock keeps running** regardless of the client's connection state — disconnection grants no stall protection (`RECONNECT-001`, `EC-G4`).

---

## 5. Public payload shape (spectator-safe)

`fetchTableState` / the published `poker_hands` row contains **only**:

```
{
  tableId, handId, handNo, state_version,
  street,                       // PREFLOP | FLOP | TURN | RIVER | SHOWDOWN | ...
  board: Card[],                // ONLY revealed streets; never future cards (A3)
  pots: { main, sides: [...] }, // integer totals + eligibility (no cards)
  seats: [{ seatIndex, userId, displayName, avatarUrl,
            stack, committedThisStreet, lastAction, status, allIn }],
  turnSeat, turnDeadline, turnStartedAt,
  reveal?: [{ seatIndex, cards }] // ONLY at SHOWDOWN→SETTLEMENT, non-mucking contenders (SHOWDOWN-REVEAL-001)
}
```

It **never** contains: another player's un-revealed hole cards, any `poker_deck` card, or an un-turned board card. Tests assert this on every payload (`EC-E1`–`EC-E6`). `stack` is public by design (`POT` math is public); only cards are secret.

---

## 6. Client reducer rules

- **Idempotent on `state_version`** — applying the same version twice is a no-op (`D4`).
- **Never derive authoritative facts locally** — winners, pots, legal actions, turn order come from the server payload + engine-computed legal set returned by the server; the client may *display* a locally computed legal-action hint but must **send intent and let the server decide** (`C2`).
- **Animations are presentation-only** (`D3`, `EC-I5`) — chip slides, card flips, and pot pushes are visual; they never gate, delay, or replace the authoritative transition. If state advances before an animation finishes, the UI snaps to truth.
- **Own hole cards** are merged from the separate RLS fetch, keyed to the current `handId` (discard on new hand).

---

## 7. Turn clock synchronization

- Authoritative deadline = `poker_hands.turn_deadline` (server-set: `turn_started_at + base(20s) [+ consumed time-bank ≤15s]`), plus a small `GRACE_MS` for network jitter (TLMN pattern).
- The client renders a countdown from `turn_deadline` but **never** enforces it; expiry is resolved server-side via `tickActionTimer` / the reaper applying `TIMEOUT-CHECK-001`/`TIMEOUT-FOLD-001`.
- `tickActionTimer` doubles as a lightweight heartbeat (TLMN pattern) but is **not** the sole sync mechanism — the watchdog + `state_version` are (this is the deliberate upgrade over TLMN, `D1`).

---

## 8. Notifications (non-authoritative)

Transient, presentation-only events (e.g., "player joined", emotes if a social layer is added later) MAY use Supabase **broadcast**. **No game secret ever rides a broadcast channel** (`A1`) — broadcasts carry only public, non-card data. State changes always go through the authoritative `postgres_changes` path, never broadcast.

---

## 9. Realtime release gates

1. Scripted "act then drop opponent's socket" recovers state without manual refresh (`D1`/`EC-I1`).
2. Duplicate/out-of-order events do not double-apply (`D4`/`EC-I2`).
3. `TOKEN_REFRESHED` does not drop the subscription (`D2`/`EC-I3`).
4. No realtime payload ever contains a foreign hole card or deck card (`A1`; shared with security gates).
5. Animation completion never changes authoritative state (`D3`/`EC-I5`).
