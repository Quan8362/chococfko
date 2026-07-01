# Poker Engine Rule Specification — Chợ Cóc FKO

**Game:** No-Limit Texas Hold'em (NLHE), play-money "xu" only.
**Status:** Authoritative specification (P0). No production code yet.
**Companions:** [player-rulebook](player-rulebook.md), [state-machine](state-machine.md), [edge-case-matrix](edge-case-matrix.md), and the architecture docs. Grounding audit: [../01-preflight-audit](../01-preflight-audit.md).

This document is the **single source of truth for the rules engine**. Every rule that can change game state or coins is assigned a **stable rule ID**. Tests in [../testing/test-plan](../testing/test-plan.md) reference these IDs. The IDs are permanent: never renumber, only deprecate.

> **Engine purity contract.** The engine (`lib/games/poker/`) is a set of **pure, deterministic, integer-only** functions with **no React and no Supabase imports**. Given the same inputs (including a seed) it produces the same outputs. It computes cards, legal actions, pot/side-pots, and winners. It does **not** read the clock, the DB, or the network. Authority over *state* belongs to the server (§ architecture); authority over *rules* belongs to this engine.

---

## 0. Conventions & locked parameters

| Parameter | Value | ID |
| --- | --- | --- |
| Variant | No-Limit Texas Hold'em | `VARIANT-001` |
| Players per table | 2–6 | `TABLE-SIZE-001` |
| Deck | Standard 52, no jokers | `DECK-001` |
| Coins | Integer "xu" only, no floats | `COIN-INT-001` |
| Minimum buy-in | 40 × big blind (BB) | `BUYIN-MIN-001` |
| Maximum buy-in | 100 × BB | `BUYIN-MAX-001` |
| Base action time | 20 seconds | `CLOCK-BASE-001` |
| Time bank | 15 seconds | `CLOCK-BANK-001` |
| Timeout when check legal | auto-check | `TIMEOUT-CHECK-001` |
| Timeout when check illegal | auto-fold | `TIMEOUT-FOLD-001` |
| Three consecutive timeouts | auto sit-out | `TIMEOUT-SITOUT-001` |
| Rake | none (v1) | `RAKE-NONE-001` |
| Ante / straddle | none (v1) | `NOEXTRA-001` |
| Run-it-twice / insurance / rabbit-hunt / bomb-pot / multi-board | none (v1) | `NOFEATURE-001` |

All blind/buy-in values are expressed in coins; **BB is a per-table constant** set at table creation. Small blind (SB) = `floor(BB / 2)` unless the table config specifies SB explicitly (`BLIND-SB-001`).

---

## 1. Cards & deck

- **`DECK-001`** The deck is exactly 52 cards: ranks `2 3 4 5 6 7 8 9 T J Q K A`, suits `♣ ♦ ♥ ♠`. No jokers, no wild cards.
- **`CARD-RANK-001`** Rank order, low→high for general comparison: `2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < T < J < Q < K < A`. Ace is high by default and low only in the wheel straight (`HAND-STRAIGHT-WHEEL-001`).
- **`CARD-SUIT-001`** Suits have **equal value**. Suit never breaks a tie, never ranks a hand, and is never used to award an odd chip. (Odd chips use position — `POT-ODD-001`.)
- **`DECK-SHUFFLE-001`** The deck is shuffled server-side with a CSPRNG (Fisher–Yates over `crypto`-grade randomness). The engine accepts a seed for deterministic tests; production passes a cryptographically random seed. Shuffle provenance MAY be recorded (commit hash) but provably-fair commit-reveal is **out of v1 scope**.
- **`DECK-DEAL-001`** Dealing order per hand: one hole card to each active seat in clockwise order starting left of the button, repeated twice (2 hole cards each), then the board is dealt by burning one card before the flop (3), before the turn (1), and before the river (1). Burn cards are never revealed. (Burn cards are a formality; the engine MAY skip physical burns since the deck is secret — but the **board indices are fixed** so the spec defines them as if burned.)

---

## 2. Hand evaluation

The engine forms the **best five-card hand** from the seven available cards (2 hole + 5 board). A player MAY use two, one, or zero hole cards (`HAND-USE-001`) — "the board plays" when the best five cards are all community cards.

### 2.1 Hand-rank ladder

**`HAND-RANK-001`** Categories, strongest → weakest:

| # | Category | ID |
| --- | --- | --- |
| 1 | Straight flush (incl. royal) | `HAND-SF-001` |
| 2 | Four of a kind | `HAND-QUADS-001` |
| 3 | Full house | `HAND-FH-001` |
| 4 | Flush | `HAND-FLUSH-001` |
| 5 | Straight | `HAND-STRAIGHT-001` |
| 6 | Three of a kind | `HAND-TRIPS-001` |
| 7 | Two pair | `HAND-TWOPAIR-001` |
| 8 | One pair | `HAND-PAIR-001` |
| 9 | High card | `HAND-HIGH-001` |

A higher category always beats a lower category regardless of card ranks within them.

### 2.2 Within-category comparison (kickers)

**`HAND-TIE-001`** Two hands of the same category are compared by their ordered significant ranks, then kickers, all descending:

- **`HAND-SF-001`** Straight flush: compare the top card of the run. `A-K-Q-J-T` (royal) is the maximum; `5-4-3-2-A` (steel wheel) is the minimum straight flush — see `HAND-STRAIGHT-WHEEL-001`.
- **`HAND-QUADS-001`** Four of a kind: compare quad rank, then the single kicker.
- **`HAND-FH-001`** Full house: compare trip rank, then pair rank.
- **`HAND-FLUSH-001`** Flush: compare all five ranks in descending order (suit irrelevant).
- **`HAND-STRAIGHT-001`** Straight: compare the top card of the run.
- **`HAND-TRIPS-001`** Three of a kind: compare trip rank, then the two kickers in descending order.
- **`HAND-TWOPAIR-001`** Two pair: compare higher pair, then lower pair, then the single kicker.
- **`HAND-PAIR-001`** One pair: compare pair rank, then the three kickers in descending order.
- **`HAND-HIGH-001`** High card: compare all five ranks in descending order.

**`HAND-EXACT-TIE-001`** If, after exhausting all five ranks/kickers, two hands are identical, they are an **exact tie** and split the relevant pot (`POT-SPLIT-001`). Because suits never break ties, exact ties are real and must be handled (e.g., both players play the same board flush of the same five ranks).

### 2.3 Straights

- **`HAND-STRAIGHT-WHEEL-001`** The **wheel** `A-2-3-4-5` is a valid straight; the Ace plays **low** and the straight's top card is the **5** (so it is the lowest straight). As a straight flush it is the **steel wheel**, the lowest straight flush.
- **`HAND-STRAIGHT-WRAP-001`** Wraparound straights are **invalid**: `Q-K-A-2-3` is **not** a straight. The Ace is either high (`T-J-Q-K-A`) or low (`A-2-3-4-5`), never both in one run.
- **`HAND-STRAIGHT-BROADWAY-001`** `T-J-Q-K-A` (Broadway) is the highest straight.

### 2.4 Evaluation invariants (testable)

- **`HAND-INV-001`** Evaluation depends only on the multiset of 7 cards; it is independent of seat, position, or who dealt.
- **`HAND-INV-002`** The evaluator returns a totally-ordered comparable value such that `compare(a,b) === 0` **iff** the hands are exact ties (suits excluded).
- **`HAND-INV-003`** "Board plays": if the best 5-of-7 for every contesting player is the five community cards, all those players tie (`HAND-USE-001` + `HAND-EXACT-TIE-001`).

---

## 3. Dealer button & blinds

- **`BUTTON-001`** Exactly one dealer button per hand. After a completed hand the button moves **one seat clockwise** to the next eligible (seated, not sitting-out, has a non-zero stack or is being dealt in) seat (`BUTTON-MOVE-001`).
- **`BLIND-001`** In a 3+ handed hand: the player **clockwise-left of the button** posts the small blind (SB); the next player posts the big blind (BB). Blinds are mandatory dead-money posts (`BLIND-POST-001`).
- **`BLIND-SB-001`** SB = configured small blind (default `floor(BB/2)`). BB = configured big blind. Both are integer coins.
- **`BLIND-SHORT-001`** A player with a stack smaller than the blind they owe posts **all-in for less**; this does not create a full blind and affects who can raise / reopen action exactly like any short all-in (`ALLIN-SHORT-001`).
- **`BLIND-PREFLOP-ORDER-001`** Preflop action starts **left of the BB** ("under the gun") and proceeds clockwise. The BB acts **last preflop** and has the **option** to check or raise if the action is not raised (`ACTION-BB-OPTION-001`).
- **`BLIND-POSTFLOP-ORDER-001`** On the flop, turn, and river, action starts with the **first active player clockwise-left of the button** (the SB seat if still in) and proceeds clockwise; the button acts last among active players.

### 3.1 Heads-up (2 players)

- **`BLIND-HEADSUP-001`** Heads-up: the **button posts the small blind** and acts **first preflop**; the other player posts the big blind and acts **last preflop**.
- **`BLIND-HEADSUP-POSTFLOP-001`** Postflop heads-up, the **big blind (non-button) acts first** and the button acts last on every street.
- **`BUTTON-HEADSUP-INTO-001`** Transition **into** heads-up (a 3-handed table drops to 2): on the next hand, recompute button/blinds under the heads-up rule; the button is the SB. No player posts the BB twice for the same physical hand.
- **`BUTTON-HEADSUP-OUTOF-001`** Transition **out of** heads-up (2 → 3+ as a player returns/joins): the next hand uses the multi-handed blind order (`BLIND-001`). New joiners follow `JOIN-BB-001`.

### 3.2 Dead button / blind continuity

- **`BLIND-DEADBTN-001`** If the player due to be the button or to post a blind has left, the engine uses **standard "dead button / dead blind" continuity**: the BB always advances by exactly one seat each hand; the button may land on an empty seat (dead button) and the SB may be skipped or posted as dead, but **no player is ever skipped for the BB to gain free hands**, and **no player pays the BB twice in a row** except via `JOIN-POSTBB-001`. The engine computes button/SB/BB deterministically from the seat ring + each seat's "last BB hand" marker.

---

## 4. Betting actions

Legal actions for the player to act are computed by the engine from: current street, the highest bet faced ("amount to call"), the player's committed amount this street, the player's stack, and whether betting is currently open. The set is always one of:

- **`ACTION-FOLD-001`** **Fold** — forfeit the hand; cards become dead. Always legal when facing a bet. Folding when the player could check is legal but discouraged (engine permits it).
- **`ACTION-CHECK-001`** **Check** — pass action with no chips, legal **only** when amount-to-call is 0 (no outstanding bet to the player). The BB preflop with no raise may check (`ACTION-BB-OPTION-001`).
- **`ACTION-CALL-001`** **Call** — match the current amount-to-call. If the amount-to-call exceeds the player's stack, a call is **all-in for less** (`ALLIN-CALLSHORT-001`): the player puts in their entire stack and contests only up to what they covered.
- **`ACTION-BET-001`** **Bet** — put chips in when amount-to-call is 0 (opening the betting on a street).
- **`ACTION-RAISE-001`** **Raise** — increase the current bet when amount-to-call > 0.
- **`ACTION-ALLIN-001`** **All-in** — commit the entire remaining stack. Mechanically a bet/call/raise capped at stack; may be short of a legal full bet/raise.

### 4.1 Bet & raise sizing (No-Limit)

- **`BET-MIN-001`** **Minimum opening bet** on any street = one big blind (BB), unless a player goes all-in for less (`ALLIN-SHORT-001`). Maximum bet = the player's entire stack (No-Limit).
- **`RAISE-MIN-001`** **Minimum raise increment** = the size of the **largest prior bet or raise on the current betting round**. Preflop the BB counts as the opening bet, so the first raise must be **to at least 2×BB** (a raise increment of at least one BB). After a raise of size `r`, the next legal raise must increase the current bet by **at least `r`**.
- **`RAISE-FULL-001`** A **full raise** is a raise whose increment ≥ the current minimum raise increment (`RAISE-MIN-001`). A full raise **reopens** the betting (`ALLIN-REOPEN-001`).
- **`RAISE-TO-001`** Raise amounts are expressed/stored as **"raise to"** (the new total this street), but the engine validates the **increment**. Client may send either "to" or "by"; the server normalizes to "to" and re-validates.
- **`BET-MAX-001`** **Maximum legal amount** for any bet/raise = the acting player's current stack (No-Limit). There is no upper cap other than the stack.

### 4.2 All-ins & reopening

- **`ALLIN-001`** A player may always go all-in for their entire stack, even if it is less than a legal minimum bet or raise.
- **`ALLIN-SHORT-001`** A **short all-in** is an all-in whose increment is **less than** the current minimum raise increment. A short all-in **does not reopen** the betting to players who have already acted and were not facing a full raise (`ALLIN-REOPEN-001`). Those players may **call** the extra or **fold**, but **may not re-raise** (the bet was not "fully" raised).
- **`ALLIN-CUMULATIVE-001`** **Cumulative short all-ins** do not aggregate into a full raise. If two consecutive short all-ins together exceed one full raise, action is still **not** reopened for players who already faced the original bet; the engine tracks the **last full raise size** independently of total chips wagered.
- **`ALLIN-REOPEN-001`** Betting is **reopened** (all remaining players get a fresh right to raise) **only** when a player makes a **full bet or full raise** (`RAISE-FULL-001`). Reopening resets the "has acted since last full raise" flags for every player still in the hand with chips behind.
- **`ALLIN-NOREOPEN-001`** When a short all-in does **not** reopen, a player who already made the last full raise **cannot raise their own bet** ("no raising yourself"); they may only call the short remainder or it is simply added to the pot.
- **`ALLIN-CALLSHORT-001`** An **all-in call for less** than the full amount-to-call: the player contests only the portion of the pot they matched; the uncalled excess from the bettor is handled by side-pot construction (`POT-SIDE-001`) and uncalled-bet refund (`POT-UNCALLED-001`).

### 4.3 Round completion

- **`ROUND-COMPLETE-001`** A betting round ends when **either**: (a) all players still in the hand with chips behind have matched the highest bet **and** every such player has had at least one chance to act since the last full bet/raise; **or** (b) only one player remains unfolded (`POT-ONELEFT-001`); **or** (c) all but at most one player are all-in and no further betting is possible.
- **`ROUND-ALLIN-RUNOUT-001`** When no further betting is possible (≤1 player has chips behind and at least two players are all-in or one is all-in and called), the engine **runs out** the remaining board cards with no further action and proceeds to showdown (`SHOWDOWN-001`). (No run-it-twice — `NOFEATURE-001`.)
- **`ROUND-ADVANCE-001`** On completion of a betting round that still has ≥2 players able to contest, the engine advances street: PREFLOP→FLOP→TURN→RIVER→SHOWDOWN, resetting per-street committed amounts and the min-raise tracker to one BB-equivalent opening (`BET-MIN-001`).

---

## 5. Pot, side-pots & settlement

All pot math is **integer-only** (`COIN-INT-001`) and **conserves coins exactly** (`POT-CONSERVE-001`: the sum of all pot awards + uncalled refund == the sum of all contributions, always).

### 5.1 Contributions

- **`CONTRIB-STREET-001`** Each player has a **current-street contribution** (reset each street) used to compute amount-to-call and min-raise.
- **`CONTRIB-TOTAL-001`** Each player has a **total hand contribution** (sum across streets), used to build pots at showdown.
- **`CONTRIB-FOLDED-001`** A folded player's chips **remain in the pot** (dead money) and are won by the eventual winner(s); the folded player has no pot eligibility.

### 5.2 Uncalled-bet refund

- **`POT-UNCALLED-001`** If a player bets/raises an amount that **no opponent fully matches** (everyone else folds or is all-in for less), the **uncalled excess** is **returned to the bettor before any pot is awarded**. The refund equals the bettor's contribution above the highest amount any single opponent committed against it. The refund is **not** part of any pot and is settled back to the bettor's stack.

### 5.3 Main pot & side-pots

- **`POT-MAIN-001`** The **main pot** is contested by **all players who have not folded** and is capped at the **smallest total contribution among all-in contesting players** (times the number of contributors at that level). Everyone still in is eligible for the main pot.
- **`POT-SIDE-001`** When players are all-in for different amounts, the engine builds **layered side-pots**. Algorithm (deterministic, integer):
  1. Take the sorted distinct **all-in contribution levels** among non-folded players.
  2. For each level `L` above the previous level `P`, create a pot layer of `(L − P) × (count of players who contributed ≥ L)`, plus any matching contributions from non-all-in callers at that level.
  3. Each pot layer's **eligible winners** = the non-folded players who contributed **at least** that layer's level.
  4. Folded players' chips are absorbed into the lowest layer(s) they reached (`CONTRIB-FOLDED-001`) but folded players are **never eligible** to win.
- **`POT-SIDE-002`** There may be **multiple** side-pots (one per distinct all-in level). Each is settled **independently** (`POT-INDEP-001`).
- **`POT-ELIG-001`** **Pot eligibility:** a player is eligible for a pot layer **iff** they did not fold **and** their total contribution ≥ that layer's level. A player all-in for a small amount can win only the main pot and lower side-pots, never a side-pot above their contribution.

### 5.4 Awarding pots

- **`POT-INDEP-001`** Each pot (main and every side-pot) is awarded **independently**: among that pot's eligible players, the best hand(s) by `HAND-RANK-001`/`HAND-TIE-001` win that pot.
- **`POT-SPLIT-001`** If two or more eligible players **exactly tie** (`HAND-EXACT-TIE-001`) for a pot, that pot is **split equally** among them (integer division).
- **`POT-ODD-001`** **Odd chip(s):** when a pot does not divide evenly among the winners, the remainder ("odd chip") is awarded to the eligible winner in the **earliest seat clockwise from the button** (standard "first seat left of the button" rule). Suits are never used. The number of odd chips is `pot mod winners` and they are distributed one each to the earliest-positioned winners.
- **`POT-ONELEFT-001`** If at any point **only one player remains unfolded**, that player wins the entire pot **immediately** with **no showdown** and **no card reveal** (their hole cards stay private — `SHOWDOWN-MUCK-001`). The hand ends in SETTLEMENT.
- **`POT-CONSERVE-001`** Invariant (must be unit-tested): for every settled hand, `Σ(stack deltas) == 0` and `Σ(pot awards) + Σ(uncalled refunds) == Σ(total contributions)`. No coin is created or destroyed.

### 5.5 Showdown

- **`SHOWDOWN-001`** Showdown occurs when the river betting round completes with ≥2 non-folded players, **or** after an all-in runout (`ROUND-ALLIN-RUNOUT-001`). The engine evaluates each contesting hand and awards each pot per `POT-INDEP-001`.
- **`SHOWDOWN-ORDER-001`** **Show order:** the last player to make an **aggressive action** (bet/raise) on the river shows first; if there was no river bet (checked down), the **first active player clockwise-left of the button** shows first, then clockwise. In an all-in runout, the player who was all-in earliest / the last aggressor shows first per standard order.
- **`SHOWDOWN-MUCK-001`** **Muck rules:** a player who is not required to show (e.g., they would lose to an already-shown hand, or everyone else folded) **may muck** — their hole cards remain **private and are never revealed** in any payload. A winner who wins uncontested (`POT-ONELEFT-001`) never shows.
- **`SHOWDOWN-REVEAL-001`** **Legally revealed cards:** only the hole cards of players who **go to showdown and do not muck** are copied into the **public reveal field** of the public hand row, and only at the SHOWDOWN→SETTLEMENT transition. Cards of folded or mucking players are **never** written to any public/broadcast/spectator/log payload (`SECURITY-HOLE-CARDS-001` in [security-model](../architecture/security-model.md)).
- **`SHOWDOWN-PRIVATE-001`** Until `SHOWDOWN-REVEAL-001` fires, **all hole cards remain private** (RLS read-own only). Board cards become public **only as each street is revealed** (`A3` in [risk register](../04-risk-register.md)); the engine must never place an un-turned board card or any hole card into the public payload.

---

## 6. Coins, idempotency & determinism (engine-facing)

- **`COIN-INT-001`** All coin quantities (stacks, blinds, bets, pots, deltas) are integers. No floating-point arithmetic anywhere in the pot/bet path.
- **`COIN-IDEMPOTENCY-001`** Settlement of a given hand is **idempotent**: applying the same settled result twice changes coins **once**. Enforced by the DB layer (`poker_hand_settlements(hand_id)` lock — see [coin-model](../architecture/coin-model.md)); the engine produces a **deterministic payout map** keyed by `hand_id` + seat so the DB can dedupe.
- **`ENGINE-DETERMINISM-001`** Given the same seed and the same ordered action list, the engine reproduces the identical hand (cards, pots, winners). This makes every hand **replayable** from `poker_actions` for audit and dispute resolution.
- **`ENGINE-REPLAY-001`** A hand is reconstructable by replaying its ordered action log against the recorded shuffle seed; the reconstruction must reproduce the recorded settlement exactly (replay test).

---

## 7. Timeouts & action clock (engine ↔ server boundary)

The **clock is owned by the server** (authoritative `turn_deadline`); the engine only defines **what** a timeout does, not when it fires.

- **`TIMEOUT-001`** On action-clock expiry the server applies the engine's **default timeout action** for the player to act.
- **`TIMEOUT-CHECK-001`** If **check is legal** (amount-to-call == 0), the timeout action is **auto-check**.
- **`TIMEOUT-FOLD-001`** If **check is not legal** (facing a bet), the timeout action is **auto-fold**.
- **`CLOCK-BASE-001` / `CLOCK-BANK-001`** Each turn grants 20 s base; a player MAY consume up to 15 s of **time bank** beyond the base before the timeout action fires. Time-bank consumption rules and replenishment are defined in [state-machine](state-machine.md) (§ ACTIVE seat).
- **`TIMEOUT-SITOUT-001`** **Three consecutive timeouts** (counting auto-check and auto-fold) flip the seat to **SIT_OUT** (`TIMEOUT-SITOUT-001`); the player is dealt out until they return (`SITOUT-RETURN-001`).

---

## 8. Rule cross-reference index

| Domain | Primary IDs |
| --- | --- |
| Deck / cards | `DECK-001`, `CARD-RANK-001`, `CARD-SUIT-001`, `DECK-SHUFFLE-001`, `DECK-DEAL-001` |
| Hand ranking | `HAND-RANK-001`, `HAND-TIE-001`, `HAND-EXACT-TIE-001`, `HAND-USE-001`, `HAND-STRAIGHT-WHEEL-001`, `HAND-STRAIGHT-WRAP-001`, `HAND-SF/QUADS/FH/FLUSH/STRAIGHT/TRIPS/TWOPAIR/PAIR/HIGH-001` |
| Button / blinds | `BUTTON-001`, `BUTTON-MOVE-001`, `BLIND-001`, `BLIND-SB-001`, `BLIND-HEADSUP-001`, `BLIND-HEADSUP-POSTFLOP-001`, `BUTTON-HEADSUP-INTO/OUTOF-001`, `BLIND-DEADBTN-001`, `BLIND-PREFLOP/POSTFLOP-ORDER-001` |
| Actions | `ACTION-FOLD/CHECK/CALL/BET/RAISE/ALLIN-001`, `ACTION-BB-OPTION-001` |
| Sizing | `BET-MIN-001`, `RAISE-MIN-001`, `RAISE-FULL-001`, `RAISE-TO-001`, `BET-MAX-001` |
| All-ins | `ALLIN-001`, `ALLIN-SHORT-001`, `ALLIN-CUMULATIVE-001`, `ALLIN-REOPEN-001`, `ALLIN-NOREOPEN-001`, `ALLIN-CALLSHORT-001` |
| Round flow | `ROUND-COMPLETE-001`, `ROUND-ALLIN-RUNOUT-001`, `ROUND-ADVANCE-001` |
| Pots | `POT-MAIN-001`, `POT-SIDE-001/002`, `POT-ELIG-001`, `POT-INDEP-001`, `POT-SPLIT-001`, `POT-ODD-001`, `POT-UNCALLED-001`, `POT-ONELEFT-001`, `POT-CONSERVE-001`, `CONTRIB-STREET/TOTAL/FOLDED-001` |
| Showdown | `SHOWDOWN-001`, `SHOWDOWN-ORDER-001`, `SHOWDOWN-MUCK-001`, `SHOWDOWN-REVEAL-001`, `SHOWDOWN-PRIVATE-001` |
| Coins / determinism | `COIN-INT-001`, `COIN-IDEMPOTENCY-001`, `ENGINE-DETERMINISM-001`, `ENGINE-REPLAY-001` |
| Clock / timeouts | `TIMEOUT-001`, `TIMEOUT-CHECK-001`, `TIMEOUT-FOLD-001`, `TIMEOUT-SITOUT-001`, `CLOCK-BASE-001`, `CLOCK-BANK-001` |

Lifecycle, buy-in, reconnect, and security rule IDs (`JOIN-*`, `BUYIN-*`, `RECONNECT-*`, `SECURITY-*`, `COIN-*` DB-side) are defined in [state-machine](state-machine.md), [coin-model](../architecture/coin-model.md), and [security-model](../architecture/security-model.md) and cross-referenced from the [edge-case-matrix](edge-case-matrix.md).
