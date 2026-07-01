# Poker Alpha — Exit Criteria

The Alpha may **not** advance to a wider Beta / public rollout while any exit blocker below is
unresolved. This is a hard gate: one open blocker = no advance.

---

## 1. Exit blockers (must all be clear)

None of the following may be present or unexplained:

- **Private-card exposure** — any leak of unrevealed hole cards, deck order, or shuffle seed
  into a public payload, broadcast, spectator view, log, analytics, or cache.
- **Coin conservation failure** — chips created or destroyed across a hand; wallet + escrow +
  stacks not conserved.
- **Duplicate settlement** — a hand settled/paid more than once.
- **Wrong main pot.**
- **Wrong side pot** (any layer).
- **Wrong winner.**
- **Inconsistent authoritative state** — players persistently seeing different truth that
  never reconciles.
- **Stack lost during reconnect** — a player's stack reduced or lost due to a disconnect /
  reconnect / refresh.
- **Cash-out duplicated** — a stack credited to the wallet more than once.
- **Authentication or RLS bypass** — reading/writing state one shouldn't, or acting as another
  user / out of turn.
- **Critical landscape control overlap** — action controls unusable on a common device such
  that a player cannot act or acts by accident.

---

## 2. How each blocker is verified as clear

| Blocker | Evidence it is clear |
|---|---|
| Private-card exposure | No such tester report; `assertSnapshotPrivacy` in place; spot-audit of public snapshots + logs shows no hole cards/deck |
| Coin conservation | `poker_ops_events.coin_conservation_failure` count = 0 over the Alpha window (dashboard); spot full-hand conservation checks |
| Duplicate settlement | `settlement_failure` = 0; no double-pay reports; idempotent settle RPC |
| Wrong main/side pot, wrong winner | No unresolved G6–G11/G16 failures; audited via `/admin/poker/hands/[handId]` |
| Inconsistent state | No unresolved desync reports; `sequence_gap` triaged to benign |
| Stack lost on reconnect | No unresolved R-series stack-loss reports |
| Cash-out duplicated | No double-credit reports; idempotent stand-up verified |
| Auth / RLS bypass | No such report; RLS on private tables/hole cards enforced; anon denied |
| Landscape overlap | No unresolved L-series major/blocker on a common device |

The dashboard (`/admin/poker/alpha`) surfaces the integrity counts and the open-report queue
in one place; `/admin/poker/observability` has the full ops-event stream.

---

## 3. Coverage gates (should be met, not just "no blockers")

The Alpha should also have **meaningfully exercised** the risky paths — an Alpha with zero
all-in hands has not tested side pots. Aim for (human targets, tracked on the dashboard):

- ≥ 1,000 completed hands
- ≥ 100 all-in hands
- ≥ 50 side-pot hands
- ≥ 100 reconnect scenarios
- ≥ 50 timeout scenarios
- Every device class and network condition in the matrix covered by at least one run
- Every locale (vi/en/ja/ko/zh) checked for action-vocabulary comprehension (U9)

If a path is under-covered, the honest conclusion is "not yet validated", **not** "passed".

---

## 4. Sign-off

Exit is a written go/no-go by the Alpha lead recording:

1. Each exit blocker → **clear** (with the evidence above) or **open** (halt).
2. Coverage gates → met / not met, with actual counts from the dashboard.
3. Outstanding non-blocker bugs → accepted-into-Beta list with owners.

Do **not** record targets as achieved unless the dashboard shows the actual numbers. Do not
claim human testing occurred without real reports as evidence.
