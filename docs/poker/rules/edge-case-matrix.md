# Poker Edge-Case Matrix — Chợ Cóc FKO

**Status:** Authoritative specification (P0).
**Purpose:** Enumerate the tricky, ambiguity-prone situations and bind each to a **deterministic expected behavior** and the governing **rule ID(s)**. Every row is a candidate test case in [../testing/test-plan](../testing/test-plan.md). Rule IDs are defined in [engine-rule-specification](engine-rule-specification.md), [state-machine](state-machine.md), [../architecture/coin-model](../architecture/coin-model.md), and [../architecture/security-model](../architecture/security-model.md).

Legend for **Severity**: 🔴 coin/cheat/privacy correctness · 🟠 fairness/flow · 🟡 UX/robustness.

---

## A. Hand evaluation & ties

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-A1 | Two players' best 5 cards are identical ranks, different suits | Exact tie → split the contested pot equally | `HAND-EXACT-TIE-001`, `POT-SPLIT-001` | 🔴 |
| EC-A2 | Board is the best hand for everyone ("board plays") | All non-folded contenders tie and split | `HAND-USE-001`, `HAND-INV-003`, `POT-SPLIT-001` | 🟠 |
| EC-A3 | Player has `A-2-3-4-5` | Valid straight, Ace low, top card 5 (lowest straight) | `HAND-STRAIGHT-WHEEL-001` | 🟠 |
| EC-A4 | Player holds `Q-K-A-2-3` | **Not** a straight | `HAND-STRAIGHT-WRAP-001` | 🟠 |
| EC-A5 | Same straight on board vs higher straight using a hole card | Higher top-card run wins | `HAND-STRAIGHT-001`, `HAND-TIE-001` | 🟠 |
| EC-A6 | Two flushes, same suit, differ only in 5th card | Higher 5th card wins; suits irrelevant | `HAND-FLUSH-001`, `CARD-SUIT-001` | 🟠 |
| EC-A7 | Full house vs full house, same trips on board | Higher pair rank wins | `HAND-FH-001` | 🟠 |
| EC-A8 | Quad on board, two players differ only by kicker | Higher kicker wins; if kicker also on board → split | `HAND-QUADS-001`, `HAND-EXACT-TIE-001` | 🟠 |
| EC-A9 | One pair, compare three kickers | Compare kickers in descending order; exhaust all 3 | `HAND-PAIR-001`, `HAND-TIE-001` | 🟡 |
| EC-A10 | Royal flush vs steel wheel straight flush | Royal (`A-K-Q-J-T`) beats steel wheel (`5-4-3-2-A`) | `HAND-SF-001`, `HAND-STRAIGHT-WHEEL-001` | 🟡 |

## B. Blinds, button & position

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-B1 | 3+ players, normal hand | SB left of button, BB next, action starts UTG, BB acts last preflop with option | `BLIND-001`, `BLIND-PREFLOP-ORDER-001`, `ACTION-BB-OPTION-001` | 🟠 |
| EC-B2 | Heads-up hand | Button posts SB & acts first preflop; non-button posts BB & acts first postflop | `BLIND-HEADSUP-001`, `BLIND-HEADSUP-POSTFLOP-001` | 🔴 |
| EC-B3 | 3-handed table drops to heads-up | Next hand recomputes button/blinds under heads-up rule; no double BB | `BUTTON-HEADSUP-INTO-001` | 🟠 |
| EC-B4 | Heads-up grows to 3-handed (player returns) | Next hand uses multi-handed order; joiner follows BB rule | `BUTTON-HEADSUP-OUTOF-001`, `JOIN-BB-001` | 🟠 |
| EC-B5 | Player due to post BB has left | Dead-button continuity: BB advances one seat; no player skipped to gain hands; no double-BB | `BLIND-DEADBTN-001` | 🟠 |
| EC-B6 | Player can't cover the blind | Posts all-in for less; treated as short all-in for reopening | `BLIND-SHORT-001`, `ALLIN-SHORT-001` | 🔴 |
| EC-B7 | New player joins between hands | Waits for natural BB OR uses Post Big Blind Now | `JOIN-BB-001`, `JOIN-POSTBB-001` | 🟡 |

## C. Betting, raises & all-ins

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-C1 | Player tries to check facing a bet | Rejected; check illegal when amount-to-call > 0 | `ACTION-CHECK-001` | 🟠 |
| EC-C2 | Opening bet below one BB | Rejected (except all-in for less) | `BET-MIN-001`, `ALLIN-001` | 🟠 |
| EC-C3 | Raise increment below the last raise size | Rejected as illegal raise; only call or fold offered | `RAISE-MIN-001` | 🟠 |
| EC-C4 | Player raises to exactly 2×BB preflop (first raise) | Legal minimum raise | `RAISE-MIN-001`, `RAISE-TO-001` | 🟡 |
| EC-C5 | Short all-in (increment < min raise) after a bet | Does **not** reopen betting; prior actors may call/fold, not re-raise | `ALLIN-SHORT-001`, `ALLIN-NOREOPEN-001` | 🔴 |
| EC-C6 | Two consecutive short all-ins together exceed a full raise | Still no reopen; engine tracks last **full** raise size, not cumulative chips | `ALLIN-CUMULATIVE-001` | 🔴 |
| EC-C7 | Full raise after a short all-in | Reopens betting for all remaining players with chips | `RAISE-FULL-001`, `ALLIN-REOPEN-001` | 🔴 |
| EC-C8 | Player calls but stack < amount-to-call | All-in call for less; contests only matched portion | `ACTION-CALL-001`, `ALLIN-CALLSHORT-001` | 🔴 |
| EC-C9 | Player tries to bet/raise more than stack | Clamped/rejected; max = stack (No-Limit) | `BET-MAX-001`, `BET-MAX-001`, `B6` | 🔴 |
| EC-C10 | Player who made the last full raise faces only a short all-in | Cannot raise themselves; may only call the remainder | `ALLIN-NOREOPEN-001` | 🟠 |
| EC-C11 | Everyone calls/checks, round completes | Advance street, reset street contributions + min-raise to opening | `ROUND-COMPLETE-001`, `ROUND-ADVANCE-001` | 🟡 |
| EC-C12 | All players but one are all-in | No more betting; run out the board to showdown | `ROUND-ALLIN-RUNOUT-001` | 🟠 |

## D. Pots, side-pots & settlement

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-D1 | Bettor's bet uncalled (all fold) | Uncalled excess returned to bettor before any award | `POT-UNCALLED-001`, `POT-ONELEFT-001` | 🔴 |
| EC-D2 | Multiway all-in, unequal stacks | Build main + layered side-pots; each settled independently | `POT-MAIN-001`, `POT-SIDE-001/002`, `POT-INDEP-001` | 🔴 |
| EC-D3 | Short all-in player wins | Wins only main/lower pots up to contribution; excess to next-best in side-pot | `POT-ELIG-001`, `POT-INDEP-001` | 🔴 |
| EC-D4 | Folded player had chips in pot | Chips stay as dead money; folder ineligible | `CONTRIB-FOLDED-001`, `POT-ELIG-001` | 🟠 |
| EC-D5 | Pot doesn't divide evenly among 2+ winners | Odd chip(s) to earliest seat left of button; suits never used | `POT-ODD-001`, `CARD-SUIT-001` | 🔴 |
| EC-D6 | Split across multiple side-pots with different winners per pot | Each pot awarded to its own eligible best hand | `POT-INDEP-001`, `POT-SPLIT-001` | 🔴 |
| EC-D7 | All fold preflop to the BB | BB wins, no showdown, no reveal; uncalled SB-vs-BB handled | `POT-ONELEFT-001`, `SHOWDOWN-MUCK-001`, `POT-UNCALLED-001` | 🟠 |
| EC-D8 | Conservation check | Σ awards + Σ refunds == Σ contributions; Σ stack deltas == 0 | `POT-CONSERVE-001` | 🔴 |
| EC-D9 | Settlement RPC called twice (retry/reconnect) | Coins applied exactly once | `COIN-IDEMPOTENCY-001`, `B1` | 🔴 |
| EC-D10 | Integer rounding in split | Integer division + odd-chip rule; no float, no created/destroyed coin | `COIN-INT-001`, `B2` | 🔴 |

## E. Showdown, reveal & privacy

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-E1 | Loser at showdown | May muck; mucked cards never appear in any payload | `SHOWDOWN-MUCK-001`, `SECURITY-HOLE-CARDS-001` | 🔴 |
| EC-E2 | Winner wins uncontested | Never shows cards | `POT-ONELEFT-001`, `SHOWDOWN-MUCK-001` | 🔴 |
| EC-E3 | Showdown reveal of contenders | Only non-mucking contenders' cards copied to public reveal, only at SHOWDOWN→SETTLEMENT | `SHOWDOWN-REVEAL-001` | 🔴 |
| EC-E4 | Spectator views the table | Receives public-only payload; never any hole card or deck card | `SHOWDOWN-PRIVATE-001`, `SECURITY-HOLE-CARDS-001` | 🔴 |
| EC-E5 | Un-turned board card present in public row before reveal | Must never happen; engine writes board only at street entry | `SHOWDOWN-PRIVATE-001`, `A3` | 🔴 |
| EC-E6 | Client tries `select('*')` on hole/deck table | Denied by RLS (read-own) / no-policy (deck) | `SECURITY-HOLE-CARDS-001`, `A1/A2` | 🔴 |
| EC-E7 | Show order at river check-down | First active player left of button shows first | `SHOWDOWN-ORDER-001` | 🟡 |

## F. Player lifecycle

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-F1 | Buy-in below 40 BB or above 100 BB | Rejected | `BUYIN-MIN-001`, `BUYIN-MAX-001` | 🟠 |
| EC-F2 | Wallet below entry minimum | Sit-down rejected; prompt daily claim | `ENTRY-GATE-001` (coin-model) | 🟠 |
| EC-F3 | Top-up requested mid-hand | Stack change applies from **next** hand, not current | `TOPUP-001` | 🟠 |
| EC-F4 | Leave requested during active hand | Player stays until settlement, then stand-up returns stack | `LEAVE-001` | 🔴 |
| EC-F5 | Sit out then return | Dealt out until return; re-seated next hand | `SITOUT-RETURN-001` | 🟡 |
| EC-F6 | 3 consecutive timeouts | Auto sit-out | `TIMEOUT-SITOUT-001` | 🟠 |
| EC-F7 | Stack reaches 0 | Busted; rebuy (40–100 BB) or stand up | `BUST-001`, `BUYIN-MIN/MAX-001` | 🟠 |
| EC-F8 | Reservation funded but player drops before deal | Escrow idempotent: SEATED or rolled back to EMPTY; never double-charged | `BUYIN-FAIL-001`, `B3` | 🔴 |
| EC-F9 | Prolonged sit-out / busted-no-rebuy | Auto stand-up returns escrow, frees seat | `SITOUT-TTL-001` | 🟡 |
| EC-F10 | Table emptied mid-hand (all humans gone) | Reaper safely settles/refunds escrow; no coins stranded | `E1`, `POT-CONSERVE-001` | 🔴 |

## G. Clock & timeouts

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-G1 | Time runs out, check is free | Auto-check | `TIMEOUT-CHECK-001` | 🟠 |
| EC-G2 | Time runs out, facing a bet | Auto-fold | `TIMEOUT-FOLD-001` | 🟠 |
| EC-G3 | Player uses time bank | Up to 15 s beyond 20 s base before timeout action | `CLOCK-BASE-001`, `CLOCK-BANK-001` | 🟡 |
| EC-G4 | Disconnect mid-turn | Clock keeps running; auto-action on deadline; no stall protection | `RECONNECT-001`, `TIMEOUT-001` | 🟠 |
| EC-G5 | Voluntary action after near-timeout | Resets consecutive-timeout counter to 0 | `TIMEOUT-SITOUT-001` | 🟡 |

## H. Errors, recovery & integrity

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-H1 | Duplicate action request (double-click / retry) | Applied once; idempotent action id | `ACTION-IDEMPOTENT-001`, `D4` | 🔴 |
| EC-H2 | Out-of-order / stale action (old snapshot) | Rejected via monotonic `state_version` re-read | `FSM-INV-003`, `C4` | 🔴 |
| EC-H3 | Client submits another user's id | Ignored; identity from `auth.uid()` server-side | `C2` (security-model) | 🔴 |
| EC-H4 | Direct PATCH to game-state table | Denied; no client write policy; writes via service-role/RPC only | `C1`, `C3` | 🔴 |
| EC-H5 | Failed `pokerAct` commit | State unchanged, turn not advanced, safe retry | `FAIL-NOADVANCE-001` | 🟠 |
| EC-H6 | Unrecoverable engine error mid-hand | Freeze → PAUSED_FOR_REVIEW; escrow intact; no winner guessed | `FAIL-FREEZE-001`, `POT-NOGUESS-001` | 🔴 |
| EC-H7 | Missed realtime event | Recovery watchdog refetches; `state_version` reconciles | `D1` (realtime-model) | 🟠 |
| EC-H8 | Pre-deal abort (shuffle/seat-freeze fail) | CANCELLED; all posts refunded idempotently | `CANCEL-REFUND-001` | 🟠 |
| EC-H9 | Admin resolves a frozen hand | Settle from replay or refund all contributions; coins conserved | `ENGINE-REPLAY-001`, `POT-CONSERVE-001` | 🟠 |
| EC-H10 | Settlement partially fails | Idempotent retry until conserved; escrow never stranded | `B1`, `B3` | 🔴 |

## I. Realtime & concurrency

| # | Situation | Expected behavior | Rule IDs | Sev |
| --- | --- | --- | --- | --- |
| EC-I1 | "Opponent acts, I never see it until refresh" | Watchdog (timer + visibility + online) recovers without manual refresh | `D1` | 🟠 |
| EC-I2 | Duplicate realtime event double-applies | Client reducer idempotent on `state_version` | `D4`, `FSM-INV-003` | 🟠 |
| EC-I3 | JWT refresh drops subscription | Singleton client + `setAuth` on `TOKEN_REFRESHED` | `D2` | 🟠 |
| EC-I4 | Two actions race on one seat | Server `FOR UPDATE` + turn check serializes; one wins | `B5`, `C4` | 🔴 |
| EC-I5 | Animation finishes before/after server state | UI never gates state on animation; state from payload only | `D3` | 🟡 |

---

## J. Coverage assertion

Every 🔴 row MUST have at least one automated test referencing its rule ID(s) before the corresponding implementation phase is declared complete (see [../testing/test-plan](../testing/test-plan.md) §"Rule-ID coverage"). The **privacy rows (EC-E*) and coin-conservation rows (EC-D8/D9/D10, EC-H10)** are non-negotiable release gates.
