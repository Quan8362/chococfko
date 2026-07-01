# Poker Alpha — Human Test Scenarios

Human-run test scripts. Each has an ID, a setup, steps, and an expected result. Run them on
the device/network matrix below. When something fails, file an **in-game report** from the
affected table/hand so the technical context is attached, and note the scenario ID in the
description.

Legend: **P** = players, **BB** = big blind. "Authoritative" means the server decides — the UI
must match the server, never the other way around.

---

## 0. Coverage matrix

Run the gameplay scripts across these axes. You do not need every script on every combination,
but every **device class**, every **network condition**, and every **player count** must be
covered by *some* run, and the integrity scripts (G-series) must be covered on at least
desktop + one phone.

**Player counts:** 2P · 3P · 4P · 5P · 6P

**Devices:**
- D1 Desktop (large screen)
- D2 Small phone, landscape
- D3 Large phone, landscape
- D4 Tablet, landscape
- D5 iOS Safari
- D6 Android Chrome
- D7 Installed PWA (where available)

**Networks:**
- N1 Stable Wi-Fi
- N2 Mobile 4G/5G
- N3 Temporary disconnection (airplane mode 5–10s, then back)
- N4 Wi-Fi → mobile-data handover mid-hand
- N5 Background the app, then resume
- N6 Browser refresh mid-hand

---

## 1. Setup / access (S-series)

- **S1 — Allowlisted tester can enter.** Sign in with an approved account → poker section
  loads, ALPHA badge visible. Expected: reachable.
- **S2 — Non-allowlisted account is blocked.** Sign in with an account NOT on the list →
  poker routes 404. Expected: not reachable (server-enforced, not just hidden).
- **S3 — Create table.** Host a 6-max table at chosen blinds → table appears in lobby.
- **S4 — Join open table.** From another account, join the table from the lobby.
- **S5 — Private table.** Create a password table; join with correct and wrong passwords.
  Expected: wrong password rejected with a clear message.
- **S6 — Freeze switch.** Ops sets `POKER_BLOCK_NEW_JOINS=1`: new sit/join/create is refused
  with a "seating paused" message; a table already mid-hand keeps playing and players can
  still cash out. Expected: running stacks never lost.

---

## 2. Gameplay correctness (G-series)

Run each at multiple player counts where noted.

- **G1 — Fold before flop (2–6P).** Everyone folds to one player preflop. Expected: last
  player wins the blinds; uncalled portion refunded; no showdown.
- **G2 — Check-down hand (2–6P).** All players check every street to showdown. Expected: pot
  awarded to the best hand; board and reveal correct.
- **G3 — Bet and fold.** A bets, others fold. Expected: A wins; A's uncalled bet is refunded
  (stack math exact).
- **G4 — Multiple raises.** 3-bet / 4-bet on one street. Expected: min-raise enforced;
  "raise to" amounts correct; call amounts correct.
- **G5 — All-in call (heads-up).** Short stack all-in, one caller. Expected: correct pot,
  correct winner, exact stacks after.
- **G6 — Multiple all-ins → side pots (3–6P).** Three+ players all-in for different amounts.
  Expected: **one main pot + correct side pots**, each awarded to the right eligible player;
  total chips conserved.
- **G7 — One side pot (3P).** Short stack all-in, two others continue. Expected: main pot
  contested by all three, side pot only by the two.
- **G8 — Multiple side pots (4–6P).** Several different all-in amounts. Expected: each layer
  correct and independently awarded.
- **G9 — Split pot.** Two players tie at showdown. Expected: pot split evenly; odd chip
  handled deterministically; no coin created or lost.
- **G10 — Uncalled-bet refund.** River bet not called. Expected: bettor keeps the uncalled
  amount; pot reflects only matched chips.
- **G11 — Exact tie with a side pot.** Tie on the main pot while a side pot has a single
  winner. Expected: both resolved correctly.
- **G12 — Timeout fold/check.** A player lets the clock expire. Expected: server auto-acts
  (check if free, else fold); turn advances; timer was server-authoritative.
- **G13 — Three timeouts.** Same player times out three times. Expected: consistent handling
  (auto sit-out per rules); no stuck hand.
- **G14 — Sit out and return.** Sit out, miss hands, return, post as required. Expected:
  blinds/rules applied correctly on return.
- **G15 — Leave during a hand.** Cash out mid-hand. Expected: seat marked leaving; stand-up
  runs at settlement; stack returned exactly once (idempotent).
- **G16 — Showdown reveal.** Contested showdown. Expected: only non-mucking contenders reveal;
  folded hands never revealed; winner highlighted from authoritative stack delta.
- **G17 — Cash-out.** Stand up outside a hand. Expected: full stack returns to wallet exactly
  once; a repeated click does not double-credit.

For every G-script also confirm: **all seated players see the same pot, board, actor, and
result**, and the amounts are integers.

---

## 3. Reconnect / network (R-series)

- **R1 — Reconnect on each street.** Trigger N3 (brief disconnect) during preflop, flop,
  turn, river, and showdown — one per run. Expected: table resyncs to authoritative state;
  no lost stack; the hand is never duplicated or skipped.
- **R2 — Network handover (N4).** Switch Wi-Fi→mobile mid-hand. Expected: reconnects and
  resyncs; your seat and stack intact.
- **R3 — Background & resume (N5).** Background the app for 30s during a hand, resume.
  Expected: state snaps to truth; timer reflects server deadline.
- **R4 — Refresh mid-hand (N6).** Hard-refresh the browser during a hand. Expected: you
  rejoin your seat, see the current authoritative state, and can act if it's your turn.
- **R5 — Both players disconnect.** In heads-up, both drop briefly. Expected: hand does not
  strand; on return the state is consistent (server/reaper authoritative).
- **R6 — Report from the reconnect screen.** While on the reconnecting/offline overlay, open
  🐞 Report a problem. Expected: report sends with `connectionState` and `reconnectCount`
  attached.

---

## 4. Responsive / landscape (L-series)

Run on D2–D7.

- **L1 — Landscape controls.** In landscape, Fold/Check/Call/Raise/All-in are fully visible
  and tappable; nothing overlaps the nav, PWA banner, or notch.
- **L2 — Portrait hint.** In portrait, the rotate-device overlay appears; gameplay is not
  attempted in portrait.
- **L3 — Bet slider + presets.** The slider and pot presets are reachable and usable one-
  handed; values update the "raise to" amount correctly.
- **L4 — Pot / side-pot readability.** Main pot and side pots are legible and don't collide
  with seats or the board.
- **L5 — Current actor visibility.** It is always obvious whose turn it is and how much time
  is left.
- **L6 — Chat vs controls.** Opening chat does not cover the action controls.
- **L7 — ALPHA badge + report button.** Neither the amber ALPHA badge nor the 🐞 button
  overlaps the action controls in landscape on small phones.

---

## 5. UX comprehension (U-series)

These test understanding, not just function. Use a tester who has **not** seen the table
before where possible.

- **U1 — First table.** A new player joins their first table. Can they sit, buy in, and act
  without help? Note every point of confusion.
- **U2 — Call amount.** Ask the tester "how much to call right now?" before they act. Was the
  UI clear?
- **U3 — Raise-to amount.** Ask what a raise will make their total bet. Is "raise to" vs
  "raise by" clear?
- **U4 — Slider.** Can they set an exact raise with the slider comfortably?
- **U5 — Pot presets.** Do ½-pot / pot presets produce the amount they expect?
- **U6 — Accidental all-in.** Is it hard to go all-in by accident? Is there a confirmation or
  clear affordance?
- **U7 — Reading pots.** Can they tell the main pot from side pots and say who's eligible?
- **U8 — Current actor.** Can they always identify the current actor?
- **U9 — Action vocabulary.** Do Fold / Check / Call / Raise / All-in read clearly in their
  language (test each locale: vi/en/ja/ko/zh)?
- **U10 — Chat.** Can they open chat and still act without the controls being covered?

---

## 6. Per-run checklist

For each scripted run, capture (via the in-game report if anything is off):

- Player count, device class, network condition, locale.
- Did all players see identical authoritative state? (Y/N)
- Any coin discrepancy? (Y/N — if Y, this is likely an **exit blocker**)
- Any stuck/frozen hand? (Y/N)
- Any control overlap in landscape? (Y/N)
- Reconnect behaviour as expected? (Y/N)
