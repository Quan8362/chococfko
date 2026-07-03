# Poker Tournaments — Player Rules (play-money)

Status: **FOUNDATION / DARK.** Tournaments are built behind the hard-off `POKER_TOURNAMENT_ENABLED`
flag and are not yet reachable by any player. This document is the player-facing rulebook the
engine and UI must honour once the feature ships.

Play-money law (unchanged): coins ("xu") have **zero** monetary value. A tournament entry fee is a
coin **sink/escrow**, a prize is a coin **source** back to winners; the net across a single
tournament is zero-sum minus nothing (no rake this phase). No real money, ever.

---

## 1. What a tournament is

A **multi-table tournament (MTT)** or **single-table tournament (STT/Sit & Go)** is a separate game
from a cash table. You pay a fixed **entry fee** in wallet coins and receive a fixed number of
**tournament chips** that exist only inside that tournament. You cannot cash tournament chips out;
they have no wallet value. You play until you either bust out or finish in a **paid** position, at
which point a **prize** (wallet coins) is credited by tournament settlement.

Key differences from a cash table (TNMT-CORE):

- **TNMT-CORE-001** Tournament chips ≠ wallet coins. Chips never move to your wallet.
- **TNMT-CORE-002** You cannot "top up", rebuy chips into the same stack (except a configured
  **re-entry**, which is a fresh entry with a new stack), or leave with your chips.
- **TNMT-CORE-003** Blinds rise on a fixed schedule for everyone at once.
- **TNMT-CORE-004** You may be moved to a different table at any hand boundary to keep tables
  balanced. You are never moved mid-hand.
- **TNMT-CORE-005** When your chips reach zero and the hand is fully settled, you are eliminated.
  Your finishing place is fixed by the order of elimination.

---

## 2. Registration (TNMT-REG)

- **TNMT-REG-001** Each tournament has a scheduled **start time**, a **registration window**, a
  **minimum** and **maximum** player count, and a fixed **entry fee**.
- **TNMT-REG-002** You register by paying the entry fee from your wallet. The fee is escrowed into
  the tournament prize pool. Registration is **idempotent**: a duplicate request never charges you
  twice and never seats you twice.
- **TNMT-REG-003** You may **cancel your registration before the tournament starts** for a full
  refund of your entry fee.
- **TNMT-REG-004** If **late registration** is configured, you may still register (and receive a
  full starting stack) until the late-reg deadline (e.g. end of level 4). After that, registration
  closes.
- **TNMT-REG-005** If the tournament does not reach its **minimum** player count by start, it is
  **cancelled** and every entry fee is fully refunded (TNMT-CANCEL-001).
- **TNMT-REG-006** If **re-entry** is configured and you bust before the re-entry deadline, you may
  pay the entry fee again for a new full stack, up to the configured re-entry limit.

## 3. Your chips and stack (TNMT-CHIP)

- **TNMT-CHIP-001** Every entry grants exactly the configured **starting stack** in tournament chips.
- **TNMT-CHIP-002** Tournament chips are **isolated**: they are stored separately from your wallet
  and from any cash-table stack, and can never be converted, transferred, or withdrawn.
- **TNMT-CHIP-003** Total chips in play equal the sum of all starting stacks (plus re-entries).
  Chips are conserved across every hand — no chip is created or destroyed by play.

## 4. Blinds, antes and breaks (TNMT-BLIND)

- **TNMT-BLIND-001** Blinds and antes rise through a fixed **blind structure**: a numbered list of
  levels, each with a small blind, big blind, optional ante, and a duration.
- **TNMT-BLIND-002** Level timing is **server-authoritative**. The clock keeps running whether or not
  you are connected; you cannot pause or slow it from the browser.
- **TNMT-BLIND-003** The lobby always shows the **current level**, the **next level**, and the **time
  remaining** in the current level.
- **TNMT-BLIND-004** **Breaks** are scheduled pauses (e.g. a 5-minute break every 4 levels) during
  which no hands are dealt. Blinds do not advance during a break.

## 5. Table movement (TNMT-BAL)

- **TNMT-BAL-001** You are moved between tables only to keep tables balanced, and only at a hand
  boundary — never during a hand you are in.
- **TNMT-BAL-002** When you are moved, you keep your entire chip stack.
- **TNMT-BAL-003** When the field shrinks to the size of one table, the **final table** forms.
- **TNMT-BAL-004** The tournament ends when one player holds all the chips (**heads-up** is the last
  two players).

## 6. Elimination and finishing place (TNMT-ELIM)

- **TNMT-ELIM-001** You are eliminated when your stack is zero **and** the hand — including all side
  pots — is fully settled.
- **TNMT-ELIM-002** Your finishing place is the reverse order of elimination: the last player
  standing is 1st; the first player out is last.
- **TNMT-ELIM-003** If two or more players are eliminated in the **same hand**, the player who
  **started the hand with more chips** finishes higher. If they started the hand with equal chips,
  they **tie** and split the combined prize money for the places they occupy (TNMT-PAY-005).

## 7. Prizes and payouts (TNMT-PAY)

- **TNMT-PAY-001** The **prize pool** is the sum of all entry fees (and re-entry fees). There is no
  rake this phase, so `prize pool = total fees collected`.
- **TNMT-PAY-002** The **payout structure** decides how many places are paid and each place's share,
  expressed as integer weights or percentages. All prize amounts are integer coins.
- **TNMT-PAY-003** You are **paid** only if you finish in a paid place. Prizes are credited to your
  wallet by tournament settlement, once, idempotently.
- **TNMT-PAY-004** If a tournament advertises a **guarantee** and total fees fall short, the operator
  covers the shortfall (an **overlay**); if fees exceed the guarantee, the larger pool is paid. This
  phase ships the guarantee **foundation** only — see payout-policy.md.
- **TNMT-PAY-005** **Ties** (players who tie under TNMT-ELIM-003) split the sum of the prizes for the
  tied places using integer division; any odd remainder chip goes to the tied player(s) by a frozen
  deterministic rule (payout-policy.md §Ties).

## 8. Disconnects and time-outs (TNMT-DC)

- **TNMT-DC-001** If you disconnect, the tournament does **not** wait for you. Blinds and antes are
  still posted from your stack each hand.
- **TNMT-DC-002** While disconnected or sitting out, you are auto-checked when checking is free and
  auto-folded when facing a bet, so the hand continues for everyone else.
- **TNMT-DC-003** If your stack is blinded/anted down to zero while you are away, you are eliminated
  normally.
- **TNMT-DC-004** Reconnecting restores your seat and full authoritative state; it never returns
  chips already committed to blinds/antes.

## 9. Cancellation and refunds (TNMT-CANCEL)

- **TNMT-CANCEL-001** If a tournament is cancelled **before it starts** (including failing to reach
  its minimum), every entry fee is refunded in full.
- **TNMT-CANCEL-002** If a tournament is cancelled **after it starts**, a frozen cancellation policy
  decides refunds — see cancellation-policy.md. Refunds are idempotent and fully audited.

## 10. Fair play

All the platform's anti-collusion, integrity, and admin-review protections apply to tournaments
exactly as they do to cash tables. Tournament chips being play-money does not weaken any integrity
rule.
