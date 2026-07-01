# Poker Coin Model — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [system-architecture](system-architecture.md), [security-model](security-model.md), [../rules/engine-rule-specification §5](../rules/engine-rule-specification.md), [../04-risk-register §B](../04-risk-register.md).

> **Play-money only.** "Xu" coins have **zero monetary value**: no purchase, no cashout, no conversion, no real-money gambling. Poker **reuses the existing wallet substrate** (`game_wallets`, `coin_ledger`) and adds Poker-specific **escrow** and **settlement** RPCs. Every coin movement is **integer, server-authoritative, atomic, idempotent, conserved, and ledgered.**

---

## 1. Reused wallet substrate (do not rebuild)

From [migration_tlmn_run7_economy.sql](../../../supabase/migration_tlmn_run7_economy.sql) + [lib/game/economy.ts](../../../lib/game/economy.ts):

| Object | Role |
| --- | --- |
| `game_wallets (user_id, balance bigint, …)` | one wallet per user; `CHECK (balance >= 0)`; RLS read-own; **no client write policy** |
| `coin_ledger (user_id, delta, balance_after, reason, …)` | append-only audit, one row per delta |
| `round_settlements (game_code, round_number) PK` | TLMN idempotency lock (template — Poker gets its own) |
| `ensure_wallet()` / `get_wallet()` | player-facing, `auth.uid()`-scoped, GRANTed to `authenticated` |
| `claim_daily_coins()` | server-rechecked daily grant |
| `settle_round(text,int,jsonb)` | **TLMN-shaped, REVOKEd from clients, GRANT service_role** — *not* reused for Poker |

**Economy constants** (`lib/game/economy.ts`, integer, single source of truth, DB defaults kept in sync):

| Constant | Value | Poker use |
| --- | --- | --- |
| `SIGNUP_GRANT` | 1,000,000 | starting wallet (shared) |
| `DAILY_GRANT` | 200,000 | daily top-up when broke (shared) |
| `DAILY_COOLDOWN_HRS` | 24 | daily claim cooldown |
| `ENTRY_MIN_BALANCE` | 10,000 | **`ENTRY-GATE-001`** — minimum wallet balance to sit down |
| `BROKE_THRESHOLD` | = `ENTRY_MIN_BALANCE` | must claim daily to keep playing |

Formatters `formatCoins` / `formatCoinsShort` / `formatCoinsFull` are reused for display (no new formatting).

> Poker's buy-in is denominated in **big blinds** (40–100 BB, `BUYIN-MIN/MAX-001`), evaluated in coins against the wallet and the entry gate. A table's BB is an integer coin value chosen at table creation; `40 × BB` must be ≥ a sane floor and the player's wallet must hold ≥ the chosen buy-in.

---

## 2. Money locations & the conservation law

Coins live in exactly two places and move only via RPCs:

```
   game_wallets.balance  ⇄  poker_seats.stack  ⇄  poker_hands pot/side-pots
        (wallet)              (table escrow)          (in-hand)
```

- **Sit-down / rebuy / top-up:** wallet → stack (escrow in).
- **Blinds / bets:** stack → pot (in-hand contributions; never touches the wallet).
- **Settlement:** pot → winners' stacks; **uncalled refund** → bettor's stack.
- **Stand-up / leave / bust-cashout / table close:** stack → wallet (escrow out).

**`COIN-CONSERVE-GLOBAL-001`** At every instant, for every user: `wallet.balance + Σ(their stacks across tables) + Σ(their live contributions in unsettled hands)` is changed only by explicit grants (`SIGNUP_GRANT`/`DAILY_GRANT`). No gameplay path creates or destroys a coin. Per-hand: `Σ pot awards + Σ uncalled refunds == Σ contributions` (`POT-CONSERVE-001`) and `Σ stack deltas == 0`.

---

## 3. Poker-specific RPCs (new — SECURITY DEFINER)

All reuse the proven discipline: `SELECT … FOR UPDATE` (deterministic lock order by `user_id`), integer-only, append a `coin_ledger` row with `balance_after` and a Poker `reason`, idempotent, and `REVOKE`d from `anon`/`authenticated` except the strictly `auth.uid()`-scoped player RPCs.

### 3.1 `poker_sit_down(table_id, seat_index, buy_in) → jsonb`
- Caller: player (`auth.uid()`).
- **Validates:** seat is EMPTY/RESERVED for caller; `buy_in` within `[40×BB, 100×BB]` (`BUYIN-MIN/MAX-001`); `wallet.balance >= buy_in` and `>= ENTRY_MIN_BALANCE` (`ENTRY-GATE-001`).
- **Action:** `FOR UPDATE` wallet; debit `buy_in` from wallet, credit `poker_seats.stack`; ledger row (`reason='poker_sit_down'`).
- **Idempotent:** keyed on a sit-down token / `(table_id, seat_index, user_id)` seat state so a retried call doesn't double-escrow (`EC-F8`, `B3`).
- **Failure:** atomic rollback; coins never partially moved (`BUYIN-FAIL-001`).

### 3.2 `poker_top_up(table_id, seat_index, amount) → jsonb`
- Caller: player. `FOR UPDATE` wallet; wallet→stack; **stack increase effective from next hand** (`TOPUP-001`) — the RPC marks `pending_topup`, applied at `HAND_COMPLETED`. Result must keep stack ≤ `100×BB` table cap. Ledgered, idempotent.

### 3.3 `poker_rebuy(table_id, seat_index, amount) → jsonb`
- Caller: player from BUSTED. Same as sit-down bounds (40–100 BB); wallet→stack; ledgered; idempotent.

### 3.4 `poker_stand_up(table_id, seat_index) → jsonb`
- Caller: player or server (reaper/close). Returns **remaining stack** to wallet; stack→wallet; ledgered (`reason='poker_stand_up'`); idempotent (a second call returns the already-settled result, moves nothing). If called mid-hand it is **queued** until settlement (`LEAVE-001`) — the seat enters LEAVING and the actual transfer runs at `HAND_COMPLETED`.

### 3.5 `poker_settle_hand(hand_id, payouts jsonb) → jsonb`
- Caller: **service role only** (REVOKEd from clients).
- **Idempotency lock:** `INSERT INTO poker_hand_settlements(hand_id, payouts) ON CONFLICT (hand_id) DO NOTHING`; if `NOT FOUND` (already settled) → return `{settled:false}` and move **no coins** (`COIN-IDEMPOTENCY-001`, `B1`, mirrors `round_settlements`).
- **Validates:** `payouts` is an integer map `seatIndex → amount`; `Σ amount + Σ uncalled_refund == hand total contribution` (`POT-CONSERVE-001`); each amount ≥ 0.
- **Action:** `FOR UPDATE` each affected seat in deterministic order; credit each seat's stack by its payout; ledger one row per credit (`reason='poker_settle_hand'`, with `balance_after`). Stacks (not wallets) are credited; coins reach the wallet only on stand-up.
- **Failure:** atomic; persistent failure leaves the lock so retries are safe; if truly unrecoverable the hand is frozen `PAUSED_FOR_REVIEW` with escrow intact (`POT-NOGUESS-001`).

### 3.6 `poker_refund_hand(hand_id) → jsonb`
- Caller: service role only. Idempotent refund of **all contributions** back to the contributing seats (used by `CANCELLED` / admin-resolved freeze). Same conservation + ledger discipline (`CANCEL-REFUND-001`).

---

## 4. Idempotency & dedupe summary

| Movement | Idempotency key | Behavior on retry |
| --- | --- | --- |
| Settlement | `poker_hand_settlements(hand_id)` PK | applies once, returns `settled:false` thereafter |
| Refund (cancel/freeze) | same settlements lock / refund flag | applies once |
| Sit-down / rebuy | seat-state token / `(table,seat,user)` | no double-escrow |
| Top-up | `pending_topup` marker per seat | applied once at next hand |
| Stand-up | seat LEAVING→EMPTY transition | returns already-done result |
| Player action (bet) | `(hand_id, action_seq)` / client nonce | applies once (`ACTION-IDEMPOTENT-001`, `D4`) |

Double-clicks, reconnect retries, and duplicate realtime-triggered calls therefore never create duplicate actions, rewards, or transfers.

---

## 5. Atomicity, locking & races

- Every coin RPC wraps its reads in `SELECT … FOR UPDATE`.
- **Deterministic lock order** (ascending `user_id`, then seat index) prevents deadlocks when a settlement touches multiple seats (`B5`, mirrors `settle_round`).
- A single in-flight betting action per seat is serialized by the turn check + row lock (`EC-I4`).
- Settlement credits all winners in one transaction so the conservation invariant holds atomically.

---

## 6. Integer-only arithmetic

- All amounts are `bigint` coins; **no floating point anywhere** in blinds, bets, pots, side-pots, splits, or refunds (`COIN-INT-001`, `B2`).
- Pot splits use **integer division**; the remainder (odd chip(s)) is awarded by **position** (`POT-ODD-001`), never by suit, never by rounding.
- `CHECK (stack >= 0)` and `CHECK (balance >= 0)`; bets clamped to stack (`B6`).

---

## 7. Ledger reasons (audit vocabulary)

Each `coin_ledger` row carries a stable `reason`: `poker_sit_down`, `poker_top_up`, `poker_rebuy`, `poker_stand_up`, `poker_blind_post` (if blinds are ledgered separately rather than as part of contribution accounting), `poker_settle_hand`, `poker_refund_hand`. Combined with `poker_actions` (per-bet log) and the recorded shuffle seed, every hand is **fully auditable and replayable** (`ENGINE-REPLAY-001`).

> Design note: in-hand contributions (blinds/bets) move stack→pot **within the hand's bookkeeping** and are reconciled at settlement. Whether each contribution writes its own ledger row or only the net per-hand result does is a P2 decision; either way the **net per hand is conserved and idempotent**, and the per-action audit lives in `poker_actions` regardless.

---

## 8. Abandonment & escrow safety

- The `poker-maintenance` reaper scans tables stuck mid-hand after all humans leave and **safely resolves escrow** (settle the live hand from authoritative state, or refund contributions), never stranding or duplicating coins (`E1`, `B3`). The lobby-load nudge is the practical workhorse (minute cron is throttled — memory `tlmn-abandoned-match-reaper`).
- On table `CLOSING`, every seat's remaining stack is returned via `poker_stand_up` (idempotent) before `CLOSED`; the table is not closed until all escrow is conserved.

---

## 9. Coin-model release gates

1. Settle a hand twice → coins applied once (`B1`/`EC-D9`).
2. Multiway all-in side-pot payout sums exactly to the pot; integer-only (`B2`/`EC-D2`/`EC-D10`).
3. Escrow round-trip (sit-down → play → stand-up) conserves wallet+stack totals (`B3`).
4. No client write policy on wallet/ledger/any poker table (`B4`).
5. Concurrent actions on one seat don't double-spend (`B5`/`EC-I4`).
6. No negative stack / over-bet (`B6`).
7. Abandoned mid-hand table resolves once, coins conserved (`E1`/`EC-F10`).
