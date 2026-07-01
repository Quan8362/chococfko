# Poker Security Model — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [system-architecture](system-architecture.md), [coin-model](coin-model.md), [realtime-model](realtime-model.md), [../04-risk-register](../04-risk-register.md).

The two catastrophic failure classes for online poker are **(1) a private card reaching someone who must not see it** and **(2) a coin being created, destroyed, duplicated, or moved without authority.** This document is the threat model and the controls. The #1 invariant:

> **`SECURITY-HOLE-CARDS-001`** — A player's hole cards, and any undealt/future card, must **never** appear in: a public table payload, a realtime broadcast, a spectator payload, a browser log, an analytics event, a public cache, or any response to a request not authenticated as that exact player. This is enforced structurally (RLS + publication + no-policy deck), not merely by convention, and is asserted by tests on **every** payload.

---

## 1. Trust model

- **Untrusted:** the browser and everything it sends. It may lie about identity, turn, amount, or state version. It is treated as adversarial.
- **Trusted:** `'use server'` actions and SECURITY DEFINER RPCs running with server credentials, and Postgres RLS.
- **Authoritative identity:** `auth.uid()` resolved **server-side** from the Supabase session cookie (`lib/supabase/server.ts`). **The client never supplies its own user id** (`C2`). All TLMN actions already follow this; Poker matches it.

---

## 2. Private-card defense in depth (🔴 highest priority)

Four independent layers, each sufficient alone; together they make a leak require multiple simultaneous failures.

### Layer 1 — Storage separation (`A1`/`A2`/`A3`)
| Data | Table | SELECT policy | Realtime |
| --- | --- | --- | --- |
| Public hand state (board *revealed only*, pots, turn) | `poker_hands` | `USING (true)` | published |
| Own hole cards | `poker_hole_cards` | `USING (user_id = auth.uid())` (read-own) | **never published** |
| Deck / undealt stub / burn / future board | `poker_deck` | **NO POLICY AT ALL** (service-role only) | **never published** |

The deck table having **no SELECT policy** is stricter than read-own: even the owning player cannot read future cards. This is the lesson from the risk register `A2` — TLMN never had to hide a live deck; Poker does.

### Layer 2 — Realtime publication scope (`D`)
Only **public** tables join `supabase_realtime`. `poker_hole_cards` and `poker_deck` are structurally excluded. A misconfigured `select('*')` on a published row still cannot return a hole card because hole cards are not in that row.

### Layer 3 — Payload shaping (`A3`/`SHOWDOWN-PRIVATE-001`)
- The engine writes board cards into the public `poker_hands` row **only at street reveal** (flop/turn/river). Un-turned board cards live only in `poker_deck`. Unit + payload tests assert the public row never contains a future card (`EC-E5`).
- Hole cards are copied into the public **reveal field** of `poker_hands` **only** at the SHOWDOWN→SETTLEMENT transition, and **only** for non-mucking contenders (`SHOWDOWN-REVEAL-001`). Folded/mucked cards are never written there (`EC-E1`/`EC-E2`).
- `fetchTableState` returns a **public projection** — it never selects from `poker_hole_cards`/`poker_deck`.

### Layer 4 — Own-card fetch path (`A1`)
Clients read their own hole cards **only** via the anon RLS client (`fetchMyHoleCards`), which RLS scopes to `auth.uid()`. Opponents' cards therefore never traverse the wire to a client. Mirrors TLMN's `fetchMyHand` ("the network payload can never contain an opponent's cards even if the server is wrong").

### Spectators (`EC-E4`)
A spectator subscribes to the **same public channel** and receives the **same public-only payload**. There is no spectator-private path. Because hole cards are not in the public row, spectator safety is automatic.

---

## 3. Deck secrecy & shuffle integrity

- **`DECK-SHUFFLE-001`** Shuffle runs **server-side** with a CSPRNG (Fisher–Yates). The shuffled stub is materialized in `poker_deck` (no SELECT policy) at `STARTING_HAND`.
- The deck **never leaves the server**: dealing advances a server-side pointer; only the **dealt** result (own hole cards to `poker_hole_cards`, revealed board to public `poker_hands`) is ever surfaced.
- **Provenance (optional, v1-light):** the shuffle seed is recorded with the hand so it is **replayable** (`ENGINE-REPLAY-001`) for dispute resolution. Full provably-fair **commit-reveal** is **out of v1 scope** (risk register G8) but the schema leaves room for a commit hash column.

---

## 4. Server-authority & anti-tamper (🔴)

| Threat | Control | Rule IDs |
| --- | --- | --- |
| Direct client write to a game-state table (set winner/board/pot/stack) | **No client write policy on any poker table.** SELECT-scoped only; all writes via service role / SECURITY DEFINER RPC. Explicit deviation from TLMN's loose `tlmn_rooms`/`tlmn_seats` RLS. | `C1`, `C3`, `EC-H4` |
| Client submits another user's id / acts out of turn / illegal action | Identity = `auth.uid()` server-side; `pokerAct` validates seat, turn, legal-action set, amount bounds, deadline. Browser sends intent only. | `C2`, `EC-H3` |
| Move-tampering via direct PATCH | Mutations only via service-role actions / definer RPCs; `REVOKE` direct INSERT/UPDATE/DELETE from `anon`/`authenticated` on every poker table (the `caro-secure-moves` lesson). | `C3`, `EC-H4` |
| Stale-state acceptance (act on an old snapshot) | Re-read authoritative state in every action; **monotonic `state_version`** on `poker_hands`; reject mismatched/stale. | `C4`, `EC-H2`, `FSM-INV-003` |
| Service-role key exposure | `createAdminClient` is server-only; never imported into a Client Component; review/lint gate. | `C5` |
| Duplicate / replayed action | **Idempotent action id** (`ACTION-IDEMPOTENT-001`): a `(hand_id, action_seq)` or client-nonce dedupe so double-click/retry applies once. | `D4`, `EC-H1` |

**`pokerAct` is the single secure-move chokepoint** (Caro `caro_make_move` discipline): one validated path, row-locked, with stable error codes; no alternate write route exists.

---

## 5. Coin-integrity controls (🔴 — detail in [coin-model](coin-model.md))

- Integer `bigint` only; no floats (`COIN-INT-001`, `B2`).
- No client write policy on `game_wallets`/`coin_ledger` or any poker table (`B4`).
- All coin moves inside SECURITY DEFINER RPCs with `SELECT … FOR UPDATE` (deterministic lock order) (`B5`).
- Idempotent settlement via `poker_hand_settlements(hand_id)` PK (`B1`, `COIN-IDEMPOTENCY-001`).
- Conservation invariant `Σ awards + Σ refunds == Σ contributions` enforced + tested (`POT-CONSERVE-001`, `B2`).
- Escrow round-trips (wallet↔stack) conserve totals; reaper never strands coins (`B3`, `E1`).
- Negative stack / over-bet impossible: engine + RPC clamp to stack; `CHECK (stack >= 0)` (`B6`).

---

## 6. Authentication & session

- Supabase Auth (email + Google/Facebook/LINE OAuth). Session persistence is hardened (memory `auth-session-persistence`, `oauth-callback-i18n`): middleware lets `@supabase/ssr` own cookie rotation; `AuthSync` handles mobile/BFCache resume + cross-tab sync.
- Realtime auth: browser client is a **singleton** to avoid JWT-refresh races; call `setAuth` on `TOKEN_REFRESHED` so the subscription's RLS context stays valid (`D2`). A stale token must never widen what a client can read.
- Private tables: the password is stored as a **hash** on `poker_tables` (never plaintext, never in a public payload); join validates server-side.

---

## 7. Logging, analytics & caching hygiene

- **No hole card or deck card** in any server log, client log, error report (`/api/client-errors`), analytics event, or `unstable_cache` entry (`A1`). Error reporting must scrub card fields.
- Public lobby lists may be cached (`createPublicClient` + `unstable_cache`); **live table state is never cached** and never contains secrets anyway.
- Showdown reveals that *are* public (non-mucking contenders) are fine to log as public history.

---

## 8. Failure posture — never guess, never strand

- **`POT-NOGUESS-001`** On any unrecoverable ambiguity, the hand freezes to `PAUSED_FOR_REVIEW`; the engine **never guesses a winner** and **never moves coins on a guess**. Escrow stays intact; an admin resolves from the replayable action log (`ENGINE-REPLAY-001`).
- **`B3`/`E1`** Abandonment/crash never strands escrow: the reaper settles or refunds idempotently, conserving coins.

---

## 9. Security release gates (must pass before ship)

1. **Privacy assertion** on every server-action and realtime payload: no other player's hole cards, no deck card (`A1`/`A2`, `EC-E1`–`EC-E6`).
2. **No client write policy** verified on `poker_tables`/`poker_seats`/`poker_hands`/`poker_hole_cards`/`poker_actions`; `poker_deck` has **no SELECT policy**; direct writes `REVOKE`d (`C1`).
3. **Idempotent + conserved settlement** proven (`B1`/`B2`/`POT-CONSERVE-001`).
4. **Stale/duplicate action rejection** via `state_version` + action-id dedupe (`C4`/`D4`).
5. **Service-role never in client bundle** (build/review check) (`C5`).

These map 1:1 to the test plan's privacy/integrity suites and to the risk register's Top-5.
