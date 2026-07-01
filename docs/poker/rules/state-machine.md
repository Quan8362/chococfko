# Poker State Machines — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Companions:** [engine-rule-specification](engine-rule-specification.md), [edge-case-matrix](edge-case-matrix.md), [../architecture/realtime-model](../architecture/realtime-model.md), [../architecture/coin-model](../architecture/coin-model.md).

This document defines four interacting state machines:

1. **Table** — the room lifecycle.
2. **Seat** — a chair at a table (independent of any single hand).
3. **Hand** — one deal from shuffle to settlement.
4. **Hand-player** — a single player's status within the current hand.

For **every** state we define: **entry conditions · allowed commands · authoritative data · public data · private data · exit conditions · timeout behavior · reconnect behavior · failure behavior.** "Authoritative data" lives server-side (service-role writes only); "public data" is realtime-published and spectator-safe; "private data" is RLS read-own or server-only.

> **Authority principle.** The browser sends **intent** (`{tableId, command, args}`) and never decides a transition. Every transition is computed server-side from re-read authoritative state, validated, then committed via service role and fanned out over realtime with a monotonically increasing `state_version` (see [realtime-model](../architecture/realtime-model.md)).

---

## 1. Table state machine

States: `OPEN · FULL · PLAYING · PAUSED · CLOSING · CLOSED`.

```
 OPEN ⇄ FULL
  │       │
  ├───────┴──→ PLAYING ⇄ PAUSED
  │                │        │
  └──────→ CLOSING ←────────┘
                │
              CLOSED
```

A table can be **playing while seats fill/empty**; `OPEN`/`FULL` describe seat availability, `PLAYING`/`PAUSED` describe whether a hand is (or can be) running. The engine treats them as orthogonal flags persisted on `poker_tables`, but for clarity they are modeled as a coarse status here. Rule IDs: `TABLE-*`.

### OPEN
- **Entry:** table created (`createTable`) with ≥1 free seat; or a player stands up from a FULL table.
- **Allowed commands:** `sitDown`, `joinAsSpectator`, `standUp` (reserved seats), `startHand` (host/auto when ≥2 seated & ready), `closeTable` (host/empty), `topUp`.
- **Authoritative:** table config (BB, SB, min/max buy-in, public/private, password hash), seat ring, button position, `state_version`.
- **Public:** table id, name, stakes, seat count/occupancy, public/private flag, current hand summary (if any). **No password, no deck, no hole cards.**
- **Private:** password hash (server-only); per-seat wallet linkage server-only.
- **Exit:** all seats filled → `FULL`; a hand starts → `PLAYING`; host closes / table empty & idle → `CLOSING`.
- **Timeout:** an OPEN table idle (no seated players) beyond the idle TTL is reaped → `CLOSING` (`TABLE-IDLE-001`).
- **Reconnect:** stateless for the table; players re-subscribe and re-read.
- **Failure:** if config is invalid the create is rejected; partial creates never publish.

### FULL
- **Entry:** every seat occupied (SEATED/ACTIVE/SIT_OUT/DISCONNECTED count == capacity).
- **Allowed commands:** same as OPEN minus `sitDown` (no free seat); `standUp`, `startHand`, `topUp`, `joinAsSpectator`.
- **Authoritative/Public/Private:** as OPEN.
- **Exit:** a seat frees → `OPEN`; hand starts → `PLAYING`; close → `CLOSING`.
- **Timeout/Reconnect/Failure:** as OPEN.

### PLAYING
- **Entry:** a hand is in progress (Hand machine not in a terminal state) with ≥2 dealt-in players.
- **Allowed commands:** `pokerAct` (current actor only), `fetchTableState`, `fetchMyHoleCards`, `sitOut` (effective next hand), `standUp`/`leave` (effective after settlement — `LEAVE-001`), `topUp` (effective next hand — `TOPUP-001`), `tickActionTimer` (clock nudge), `joinAsSpectator`.
- **Authoritative:** full hand state (deck, board, pots, per-player contributions, turn, deadline), `state_version`.
- **Public:** board (revealed streets only), pot totals, side-pot structure, each seat's public stack & committed amount, whose turn, `turn_deadline`, action history (amounts/types — not cards).
- **Private:** each player's own hole cards (RLS read-own); deck/stub/burn (server-only, no SELECT).
- **Exit:** hand reaches HAND_COMPLETED → back to `OPEN`/`FULL` (or auto-start next hand → stays PLAYING); all but one player leave → `PAUSED`; host closes → `CLOSING`.
- **Timeout:** action-clock expiry triggers `TIMEOUT-CHECK-001`/`TIMEOUT-FOLD-001`; the reaper resolves an abandoned in-flight hand (`E1`).
- **Reconnect:** returning player re-subscribes, re-reads public state, re-fetches own hole cards (`RECONNECT-001`); their seat/clock continued running while away.
- **Failure:** an unrecoverable engine/commit error freezes the hand → `PAUSED_FOR_REVIEW` (Hand machine) with no winner guessed (`FAIL-FREEZE-001`).

### PAUSED
- **Entry:** fewer than 2 eligible players to start a new hand (everyone sat out / only one human left), or admin pause.
- **Allowed commands:** `sitDown`, `return` (from sit-out), `standUp`, `closeTable`, `topUp`. **No `startHand`** until ≥2 ready.
- **Authoritative/Public/Private:** table config + idle seats; no active hand secrets.
- **Exit:** ≥2 players ready → `OPEN`/`FULL` then `PLAYING` on next `startHand`; prolonged emptiness → `CLOSING`.
- **Timeout:** idle TTL → `CLOSING`.
- **Reconnect:** as OPEN.
- **Failure:** none specific.

### CLOSING
- **Entry:** host closes, or table idle/empty past TTL, or a frozen hand resolved by admin and table flagged to close.
- **Allowed commands:** `standUp` only (auto-executed for all seats); no new hands, no sit-downs.
- **Behavior:** every seated player's remaining **stack is returned to their wallet** via `poker_stand_up` (idempotent, ledgered); any in-flight hand must already be settled/refunded (`E1`) before reaching CLOSING.
- **Public:** "table closing" status.
- **Exit:** all stacks returned & seats empty → `CLOSED`.
- **Timeout:** reaper completes outstanding stand-ups.
- **Reconnect:** player sees closing screen; their stack is/was returned.
- **Failure:** if a stand-up payout fails it is retried idempotently; table stays in CLOSING until all escrow is conserved (never strands coins).

### CLOSED
- **Entry:** all escrow returned, no occupied seats.
- **Allowed commands:** none (read-only history).
- **Public:** terminal record (final, for history/leaderboard).
- **Exit:** none (terminal). Row retained for audit/history.
- **Timeout/Reconnect/Failure:** n/a.

---

## 2. Seat state machine

States: `EMPTY · RESERVED · SEATED · ACTIVE · SIT_OUT · DISCONNECTED · LEAVING · BUSTED`. Rule IDs: `SEAT-*`, `JOIN-*`, `BUYIN-*`, `SITOUT-*`, `LEAVE-*`, `TIMEOUT-*`.

```
 EMPTY → RESERVED → SEATED ⇄ SIT_OUT
                      │ ⇅        ▲
                      ▼ │        │
                    ACTIVE ──────┘
                      │  ↘ DISCONNECTED ─┐
                      ▼                  │
                   LEAVING               │
                      │                  │
                      ▼                  ▼
                   (→ EMPTY)          BUSTED → (rebuy→SEATED | →LEAVING)
```

### EMPTY
- **Entry:** table created, or a player fully leaves (`LEAVING`→`EMPTY`), or stand-up completes.
- **Allowed commands:** `sitDown` (reserves the seat).
- **Authoritative:** seat index, table id, null occupant.
- **Public:** "empty seat" marker.
- **Private:** none.
- **Exit:** `sitDown` → `RESERVED`.
- **Timeout/Reconnect/Failure:** n/a.

### RESERVED
- **Entry:** `sitDown` accepted; buy-in escrow being moved wallet→stack via `poker_sit_down`.
- **Allowed commands:** complete buy-in (server), cancel (`standUp` before deal).
- **Authoritative:** pending occupant `user_id`, escrow amount in flight (`FOR UPDATE`, idempotent).
- **Public:** "seat reserved" (name/avatar may show as joining).
- **Private:** escrow transaction state (server-only).
- **Exit:** escrow committed → `SEATED`; escrow fails/cancel → refund & `EMPTY` (`BUYIN-FAIL-001`).
- **Timeout:** reservation TTL without funded buy-in → refund & `EMPTY`.
- **Reconnect:** if the player drops mid-reservation, the escrow RPC's idempotency ensures no double charge; on return the seat is either SEATED (escrow done) or EMPTY (rolled back).
- **Failure:** escrow RPC failure rolls back atomically; coins never partially moved.

### SEATED
- **Entry:** buy-in escrowed; player present but **not in the current hand** (waiting for BB or post-BB choice, or between hands).
- **Allowed commands:** `postBigBlindNow` (`JOIN-POSTBB-001`), `waitForBigBlind` (`JOIN-BB-001`, default), `sitOut`, `standUp`/`leave`, `topUp` (next hand — `TOPUP-001`).
- **Authoritative:** stack (escrowed), seat flags, "missed BB?" marker, last-BB-hand for blind continuity (`BLIND-DEADBTN-001`).
- **Public:** name, avatar, public stack, "sitting in / waiting for BB".
- **Private:** none (no cards yet).
- **Exit:** dealt into a new hand → `ACTIVE`; `sitOut` → `SIT_OUT`; `standUp` → `LEAVING`/`EMPTY`; stack 0 with no rebuy → `BUSTED`.
- **Timeout:** none (not on the clock between hands).
- **Reconnect:** trivial re-read.
- **Failure:** none specific.

### ACTIVE
- **Entry:** dealt hole cards in the current hand; the player's hand-player state is `ACTIVE` or `ALL_IN`.
- **Allowed commands:** `pokerAct` **only when it is this seat's turn** (`ACTION-*`); `fetchMyHoleCards`; `sitOut`/`standUp` queued for after the hand; `topUp` queued for next hand.
- **Authoritative:** stack, current-street contribution (`CONTRIB-STREET-001`), total contribution (`CONTRIB-TOTAL-001`), turn flag, `turn_deadline`, `turn_started_at`, **time-bank remaining**, **consecutive-timeout counter**.
- **Public:** public stack, committed-this-street, last action, all-in flag, "to act" + deadline. **Never the hole cards.**
- **Private:** own 2 hole cards (RLS read-own).
- **Exit:** folds → hand-player `FOLDED` (seat stays ACTIVE-in-hand but out of contention); all-in → `ALL_IN`; hand ends → `SEATED` (or `BUSTED` if stack 0); 3 consecutive timeouts → `SIT_OUT` (`TIMEOUT-SITOUT-001`).
- **Timeout (`TIMEOUT-001`):** at `turn_deadline` (base 20 s + up to 15 s time bank consumed), the server applies auto-check (`TIMEOUT-CHECK-001`) or auto-fold (`TIMEOUT-FOLD-001`) and increments the consecutive-timeout counter; a voluntary action resets the counter to 0.
- **Time bank:** the 15 s bank is consumed only after the 20 s base elapses on a turn; consumed bank is **not** auto-refilled mid-session in v1 (refill policy is a tuning constant, default: no refill). A player who acts within base time does not touch the bank.
- **Reconnect (`RECONNECT-001`):** the clock **keeps running** while disconnected; on return within the deadline the player resumes and may act. If the deadline passed, the timeout action already applied. Returning player re-fetches own hole cards.
- **Failure:** a commit failure during `pokerAct` returns an error to the caller, leaves authoritative state unchanged (action not applied), and does **not** advance the turn (`FAIL-NOADVANCE-001`); the client retries safely (idempotent action id — `ACTION-IDEMPOTENT-001`).

### SIT_OUT
- **Entry:** `sitOut` chosen, or 3 consecutive timeouts (`TIMEOUT-SITOUT-001`), or auto on disconnect-past-grace between hands.
- **Allowed commands:** `return` (`SITOUT-RETURN-001`), `standUp`/`leave`, `topUp`.
- **Authoritative:** stack preserved (still escrowed), sit-out flag, missed-blind marker.
- **Public:** "sitting out" badge; stack shown.
- **Private:** none (dealt out — no cards).
- **Exit:** `return` + dealt next hand → `SEATED`→`ACTIVE`; `standUp` → `LEAVING`; idle-sit-out TTL → auto `standUp` (stack returned) → `EMPTY` (`SITOUT-TTL-001`).
- **Timeout:** prolonged sit-out → auto stand-up to free the seat & return escrow.
- **Reconnect:** trivial.
- **Failure:** none specific.

### DISCONNECTED
- **Entry:** realtime/presence loss detected while seated (especially mid-hand).
- **Allowed commands:** (server-driven) clock continues; on reconnect → resume.
- **Authoritative:** same as ACTIVE if mid-hand; disconnect timestamp.
- **Public:** "disconnected" badge; the hand and clock proceed; auto-check/fold applies on timeout exactly as for a present player.
- **Private:** own hole cards remain RLS read-own (fetched on return).
- **Exit:** reconnect within hand → `ACTIVE`; repeated timeouts → `SIT_OUT`; between hands disconnect-past-grace → `SIT_OUT`.
- **Timeout:** identical to ACTIVE timeouts — disconnection grants no protection from the clock (money-bearing: cannot stall the table).
- **Reconnect (`RECONNECT-001`):** re-subscribe, re-read public, re-fetch own hole cards, resume seat. Escrow untouched.
- **Failure:** the abandonment reaper (`E1`) protects escrow if the whole table goes dark.

### LEAVING
- **Entry:** `standUp`/`leave` requested. If requested **during an active hand**, the seat enters LEAVING but the player **stays in the hand until settlement** (`LEAVE-001`); the stand-up executes after HAND_COMPLETED.
- **Allowed commands:** cancel-leave (before settlement, optional), nothing else.
- **Authoritative:** leave-requested flag; stack pending return.
- **Public:** "leaving after this hand".
- **Private:** own hole cards until the hand ends.
- **Exit:** hand settles (or no active hand) → `poker_stand_up` returns stack to wallet → `EMPTY`.
- **Timeout:** none.
- **Reconnect:** leave intent persists; stand-up still executes post-settlement.
- **Failure:** stand-up payout is idempotent; retried until escrow conserved; seat not freed until coins returned (`B3`).

### BUSTED
- **Entry:** stack reaches 0 at hand end (`BUST-001`).
- **Allowed commands:** `rebuy` (within 40–100 BB — `BUYIN-MIN/MAX-001`), `standUp`/`leave`.
- **Authoritative:** stack = 0, busted flag.
- **Public:** "busted / rebuy?".
- **Private:** none.
- **Exit:** `rebuy` (escrow wallet→stack) → `SEATED`; `standUp` → `LEAVING`→`EMPTY`; rebuy-idle TTL → auto stand-up → `EMPTY`.
- **Timeout:** rebuy TTL → auto stand-up.
- **Reconnect:** trivial.
- **Failure:** rebuy escrow is atomic/idempotent (`B3`).

---

## 3. Hand state machine

States: `WAITING_FOR_PLAYERS · STARTING_HAND · POSTING_BLINDS · DEALING_HOLE_CARDS · PREFLOP · FLOP · TURN · RIVER · SHOWDOWN · SETTLEMENT · HAND_COMPLETED · PAUSED_FOR_REVIEW · CANCELLED`. Rule IDs: `HANDFSM-*` (rules referenced from [engine-rule-specification](engine-rule-specification.md)).

```
 WAITING_FOR_PLAYERS → STARTING_HAND → POSTING_BLINDS → DEALING_HOLE_CARDS
        ▲                                                       │
        │                                                       ▼
 HAND_COMPLETED ← SETTLEMENT ← SHOWDOWN ← RIVER ← TURN ← FLOP ← PREFLOP
        │                ▲          ▲         (any street can jump to SHOWDOWN
        │                │          │          via all-in runout, or to
        │          (POT-ONELEFT)    │          SETTLEMENT via POT-ONELEFT)
        │                └──────────┘
        └─→ (auto next hand)
 Any non-terminal → PAUSED_FOR_REVIEW (unrecoverable) | CANCELLED (pre-deal abort)
```

### WAITING_FOR_PLAYERS
- **Entry:** table PLAYING/OPEN but fewer than 2 dealt-in-eligible players, or between hands.
- **Allowed commands:** seat-level (`sitDown`, `return`, `postBigBlindNow`); no hand actions.
- **Authoritative:** none for a hand yet (no deck).
- **Public/Private:** none hand-specific.
- **Exit:** ≥2 eligible → `STARTING_HAND`.
- **Timeout:** none.
- **Reconnect:** trivial.
- **Failure:** none.

### STARTING_HAND
- **Entry:** ≥2 eligible players; auto/host triggers a new hand.
- **Allowed commands:** none (server-internal).
- **Authoritative:** new `hand_id`, button position computed (`BUTTON-MOVE-001`/`BLIND-DEADBTN-001`), eligible seat set frozen, `state_version` bumped, shuffle seed generated server-side.
- **Public:** "new hand starting", button position, hand id.
- **Private:** shuffled deck materialized in **server-only** `poker_deck` (no SELECT policy — `A2`).
- **Exit:** → `POSTING_BLINDS`.
- **Timeout:** none.
- **Reconnect:** trivial.
- **Failure:** if shuffle/seat-freeze fails → `CANCELLED` (no coins moved, no cards dealt).

### POSTING_BLINDS
- **Entry:** hand created.
- **Allowed commands:** none (forced posts are server-applied).
- **Authoritative:** SB/BB posted to the pot (`BLIND-001`/`BLIND-HEADSUP-001`), short blinds → all-in-for-less (`BLIND-SHORT-001`), each poster's stack debited into current-street contribution, dead-button continuity applied.
- **Public:** blinds posted, pot seed, who is SB/BB, button.
- **Private:** none.
- **Exit:** → `DEALING_HOLE_CARDS`.
- **Timeout:** none.
- **Reconnect:** trivial (blinds are deterministic).
- **Failure:** insufficient-stack handled as short blind, not a failure; a true commit failure → `PAUSED_FOR_REVIEW` (no partial blind).

### DEALING_HOLE_CARDS
- **Entry:** blinds posted.
- **Allowed commands:** `fetchMyHoleCards` (after deal commit).
- **Authoritative:** 2 hole cards per ACTIVE seat written to `poker_hole_cards` (RLS read-own) from the server-only deck (`DECK-DEAL-001`); deck pointer advanced server-side.
- **Public:** **card counts only** (e.g., "2 cards each"); never the cards.
- **Private:** each player's own 2 hole cards (RLS read-own, never published).
- **Exit:** → `PREFLOP`.
- **Timeout:** none.
- **Reconnect:** returning player fetches own hole cards via anon RLS client.
- **Failure:** if any hole-card write fails before all are dealt → `CANCELLED` (refund blinds) — never deal a partial hand.

### PREFLOP / FLOP / TURN / RIVER (betting streets)
Shared shape; differences noted.
- **Entry:** previous phase complete; for FLOP/TURN/RIVER the corresponding board cards are revealed into the **public** hand row **at street entry only** (`SHOWDOWN-PRIVATE-001`/`A3`): FLOP = 3 cards, TURN = +1, RIVER = +1. Burn handled per `DECK-DEAL-001`.
- **Allowed commands:** `pokerAct(action, amount)` from the **current actor only** (`ACTION-*`, validated against legal set + sizing `BET-MIN/RAISE-MIN`), `fetchMyHoleCards`, `fetchTableState`, `tickActionTimer`.
- **Authoritative:** per-player current-street + total contributions, highest bet, last-full-raise size (`ALLIN-REOPEN-001`), turn pointer, `turn_deadline`/`turn_started_at`, action audit rows in `poker_actions`, `state_version` per accepted action.
- **Public:** revealed board for this street, pot + side-pot totals, each seat's public stack & committed-this-street, current actor + deadline, action history (type+amount, no cards).
- **Private:** own hole cards; the **undealt deck / future board / burn** stay in server-only `poker_deck`.
- **Exit:** betting round completes (`ROUND-COMPLETE-001`) → next street (`ROUND-ADVANCE-001`); only one player left (`POT-ONELEFT-001`) → `SETTLEMENT`; no further betting possible (`ROUND-ALLIN-RUNOUT-001`) → run out remaining streets then `SHOWDOWN`; after RIVER betting with ≥2 players → `SHOWDOWN`.
- **Timeout (`TIMEOUT-001`):** current actor times out → auto-check (`TIMEOUT-CHECK-001`) or auto-fold (`TIMEOUT-FOLD-001`); turn advances; consecutive-timeout counter increments (3 → sit-out).
- **Reconnect:** clock keeps running; returning actor may act if before deadline; re-fetch own hole cards + public state; monotonic `state_version` reconciles missed updates.
- **Failure:** a rejected/failed `pokerAct` does not advance the turn (`FAIL-NOADVANCE-001`); an unrecoverable engine error mid-street → `PAUSED_FOR_REVIEW` (no winner guessed — `FAIL-FREEZE-001`).

### SHOWDOWN
- **Entry:** river betting complete with ≥2 contenders, or all-in runout finished.
- **Allowed commands:** none player-driven (reveal is server-computed); optional `muck` choice where a player isn't required to show.
- **Authoritative:** engine evaluates every contesting hand (`HAND-RANK-001`), builds pots/side-pots (`POT-MAIN/SIDE-001`), determines winners per pot (`POT-INDEP-001`), computes odd-chip awards (`POT-ODD-001`) and uncalled refund (`POT-UNCALLED-001`).
- **Public:** at SHOWDOWN→SETTLEMENT, the **revealed** hole cards of non-mucking contenders only (`SHOWDOWN-REVEAL-001`), show order (`SHOWDOWN-ORDER-001`), winning hands, pot allocations.
- **Private:** mucked/folded hole cards stay private forever (`SHOWDOWN-MUCK-001`).
- **Exit:** → `SETTLEMENT`.
- **Timeout:** auto-reveal/auto-muck per rule if a player doesn't choose within a short window (loser may auto-muck; winner auto-shows).
- **Reconnect:** returning player sees the public reveal; never sees mucked cards.
- **Failure:** evaluation error → `PAUSED_FOR_REVIEW`; never guess a winner.

### SETTLEMENT
- **Entry:** winners + payouts computed (or `POT-ONELEFT-001` short-circuit with no showdown).
- **Allowed commands:** none player-driven.
- **Authoritative:** `poker_settle_hand(hand_id, payouts)` applies integer stack credits **idempotently** (`COIN-IDEMPOTENCY-001`, `poker_hand_settlements(hand_id)` lock, `FOR UPDATE`, `coin_ledger` rows), conserving coins (`POT-CONSERVE-001`).
- **Public:** final pot awards, new stacks, winners; revealed cards (from SHOWDOWN) if any.
- **Private:** none new.
- **Exit:** settlement committed → `HAND_COMPLETED`.
- **Timeout:** none (atomic).
- **Reconnect:** idempotent — a retried settlement applies once.
- **Failure:** a settlement failure leaves coins unchanged and re-tries idempotently; persistent failure → `PAUSED_FOR_REVIEW` with escrow intact (`B1`/`B3`).

### HAND_COMPLETED
- **Entry:** settlement committed.
- **Allowed commands:** queued seat transitions execute now: `standUp`/`leave` (`LEAVE-001`), `topUp` becomes active (`TOPUP-001`), sit-out/return, bust→rebuy prompt; stats recorded.
- **Authoritative:** final hand record + action log retained (replayable — `ENGINE-REPLAY-001`); button advances for next hand.
- **Public:** hand result summary (history/leaderboard).
- **Private:** none.
- **Exit:** ≥2 eligible → `STARTING_HAND` (next hand); else → table `PAUSED`/`OPEN`.
- **Timeout:** brief inter-hand pause then auto-start.
- **Reconnect:** trivial.
- **Failure:** none.

### PAUSED_FOR_REVIEW
- **Entry:** any unrecoverable failure where the correct outcome is uncertain (`FAIL-FREEZE-001`).
- **Allowed commands:** none player-driven; admin-only inspection/resolution.
- **Authoritative:** full frozen state + action log preserved for replay; **escrow untouched, no winner guessed** (`POT-NOGUESS-001`).
- **Public:** "hand under review" status to seated players.
- **Private:** preserved; never leaked.
- **Exit:** admin resolves (settle from replay or refund all contributions) → `SETTLEMENT`/`CANCELLED`.
- **Timeout:** none (waits for admin).
- **Reconnect:** players see review status; coins safe.
- **Failure:** terminal until admin acts; the table may move to PAUSED.

### CANCELLED
- **Entry:** a hand aborted **before meaningful play** (pre-deal failure, not enough players after blinds couldn't be posted, partial-deal abort).
- **Allowed commands:** none.
- **Authoritative:** **all posted blinds / contributions refunded** to stacks (`CANCEL-REFUND-001`), idempotently; no winner.
- **Public:** "hand cancelled".
- **Private:** any partially dealt cards discarded (never revealed).
- **Exit:** → `WAITING_FOR_PLAYERS`.
- **Timeout:** none.
- **Reconnect:** trivial; refunds are idempotent.
- **Failure:** refund retried until coins conserved.

---

## 4. Hand-player state machine

States: `NOT_DEALT · ACTIVE · FOLDED · ALL_IN · WINNER`. Scoped to one hand.

```
 NOT_DEALT → ACTIVE → FOLDED
                │  ↘ ALL_IN
                ▼      │
             WINNER ←──┘   (WINNER is a settlement label, not an action state)
```

### NOT_DEALT
- **Entry:** seat exists but not dealt into this hand (joined late / sitting out / waiting for BB).
- **Allowed commands:** seat-level only.
- **Authoritative:** no hole cards; not in contention.
- **Public:** "not in hand".
- **Private:** none.
- **Exit:** dealt next hand → `ACTIVE`.
- **Timeout/Reconnect/Failure:** n/a.

### ACTIVE
- **Entry:** dealt 2 hole cards, still in contention, has chips behind.
- **Allowed commands:** `pokerAct` on own turn (fold/check/call/bet/raise/all-in).
- **Authoritative:** hole cards (private), contributions, can-act flag.
- **Public:** committed amount, last action; **not cards**.
- **Private:** own 2 hole cards.
- **Exit:** fold → `FOLDED`; commit entire stack → `ALL_IN`; hand ends as best hand for a pot → `WINNER` (settlement label); hand ends without winning → back to seat `SEATED`/`BUSTED`.
- **Timeout:** auto-check/fold (`TIMEOUT-001`).
- **Reconnect:** resume; re-fetch own cards.
- **Failure:** failed action does not advance (`FAIL-NOADVANCE-001`).

### FOLDED
- **Entry:** player folds (or auto-fold on timeout).
- **Allowed commands:** none in this hand.
- **Authoritative:** cards dead; chips already in pot stay as dead money (`CONTRIB-FOLDED-001`); **no pot eligibility** (`POT-ELIG-001`).
- **Public:** "folded".
- **Private:** folded hole cards **never revealed** (`SHOWDOWN-MUCK-001`).
- **Exit:** hand ends → seat returns to `SEATED`/`BUSTED`.
- **Timeout/Reconnect/Failure:** spectator-like for the rest of the hand.

### ALL_IN
- **Entry:** player commits entire remaining stack (`ACTION-ALLIN-001`).
- **Allowed commands:** none further this hand (no chips behind).
- **Authoritative:** total contribution fixes the player's pot-eligibility ceiling (`POT-ELIG-001`); eligible for main + lower side-pots only.
- **Public:** "all-in", committed amount, all-in flag; board runs out (`ROUND-ALLIN-RUNOUT-001`).
- **Private:** own hole cards (revealed only if they reach showdown without mucking — `SHOWDOWN-REVEAL-001`).
- **Exit:** showdown → `WINNER` (if best for an eligible pot) or out; busts if loses everything.
- **Timeout:** not on the clock (cannot act).
- **Reconnect:** trivial; outcome is server-computed at showdown.
- **Failure:** none player-driven.

### WINNER
- **Entry:** settlement assigns this player ≥1 pot (`POT-INDEP-001`), possibly split (`POT-SPLIT-001`) with odd-chip rule (`POT-ODD-001`).
- **Allowed commands:** none (label only).
- **Authoritative:** stack credited via idempotent settlement (`COIN-IDEMPOTENCY-001`).
- **Public:** winning hand (if shown), amount won.
- **Private:** none new.
- **Exit:** → seat `SEATED` for next hand.
- **Timeout/Reconnect/Failure:** settlement idempotent on retry.

---

## 5. Cross-machine invariants

- **`FSM-INV-001`** A seat can be `ACTIVE` (seat machine) only while the hand is in a betting street, SHOWDOWN, or SETTLEMENT; hand-player `ACTIVE`/`ALL_IN`/`FOLDED` are sub-states scoped to that hand.
- **`FSM-INV-002`** No coin moves outside `POSTING_BLINDS`, `SETTLEMENT`, `CANCELLED` (refund), and seat escrow (`poker_sit_down`/`poker_stand_up`/rebuy/top-up). Every move is integer, idempotent, ledgered.
- **`FSM-INV-003`** `state_version` is strictly increasing per `poker_hands` row on every accepted transition; clients reject stale/duplicate updates (`D4`).
- **`FSM-INV-004`** No transition is ever decided client-side; the browser only requests it (`C2`/`C3`).
- **`FSM-INV-005`** A frozen hand (`PAUSED_FOR_REVIEW`) never guesses a winner and never strands escrow (`POT-NOGUESS-001`, `B3`).
