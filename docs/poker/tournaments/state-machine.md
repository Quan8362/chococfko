# Poker Tournament — State Machine

Two FSMs: the **tournament** lifecycle and the per-**player/entry** lifecycle. Both are enforced by
the pure `stateMachine.ts` module (legal-transition tables) and re-enforced by the SECURITY DEFINER
RPCs. An illegal transition is rejected server-side; the browser cannot force one.

## 1. Tournament states (TNMT-STATE)

```
DRAFT ──▶ SCHEDULED ──▶ REGISTRATION_OPEN ──▶ STARTING ──▶ RUNNING ⇄ BREAK
                                                              │         │
                                                              ▼         │
                                                          FINAL_TABLE ◀─┘
                                                              │
                                                              ▼
                                                          COMPLETED

Any of {DRAFT, SCHEDULED, REGISTRATION_OPEN, STARTING} ──▶ CANCELLED
Any live state ──▶ PAUSED_FOR_REVIEW ──▶ (resume to prior live state) | CANCELLED
```

| State | Meaning | May transition to |
|---|---|---|
| `DRAFT` | Admin is authoring; not visible to players | `SCHEDULED`, `CANCELLED` |
| `SCHEDULED` | Published with a start time; registration not yet open | `REGISTRATION_OPEN`, `CANCELLED` |
| `REGISTRATION_OPEN` | Players may register / cancel registration | `STARTING`, `CANCELLED` |
| `STARTING` | Reg closed (or late-reg), seats being drawn, first hands dealing | `RUNNING`, `CANCELLED` |
| `RUNNING` | Hands in progress across ≥1 table | `BREAK`, `FINAL_TABLE`, `PAUSED_FOR_REVIEW`, `CANCELLED` |
| `BREAK` | Scheduled pause; no hands dealt; blind clock frozen | `RUNNING`, `FINAL_TABLE`, `PAUSED_FOR_REVIEW`, `CANCELLED` |
| `FINAL_TABLE` | Field down to one table; plays to a winner | `COMPLETED`, `PAUSED_FOR_REVIEW`, `CANCELLED` |
| `COMPLETED` | Winner decided, all payouts settled | (terminal) |
| `CANCELLED` | Cancelled; refunds/partial payouts settled per policy | (terminal) |
| `PAUSED_FOR_REVIEW` | Admin/integrity hold; state frozen | resume to prior live state, or `CANCELLED` |

Rules:

- **TNMT-STATE-001** Transitions follow the table above only; `stateMachine.ts` exposes
  `canTransition(from, to)` and `tournamentTransitions[]`. Unknown transitions return `false`.
- **TNMT-STATE-002** `PAUSED_FOR_REVIEW` records the state it paused **from**; resume restores exactly
  that state. It is reachable from any live state (`STARTING`/`RUNNING`/`BREAK`/`FINAL_TABLE`).
- **TNMT-STATE-003** `CANCELLED` is reachable from any non-terminal state. Cancellation from a
  pre-start state → full refunds; from a live state → cancellation-policy.md.
- **TNMT-STATE-004** `COMPLETED` and `CANCELLED` are terminal — no outgoing transitions.
- **TNMT-STATE-005** Registration is permitted only in `REGISTRATION_OPEN`, plus in
  `STARTING`/`RUNNING`/`BREAK` **iff** late-registration is configured and the late-reg deadline has
  not passed (TNMT-REG-004).

## 2. Player / entry states (TNMT-PSTATE)

```
REGISTERED ──▶ SEATED ──▶ ACTIVE ⇄ DISCONNECTED
                 │           │
                 │           ├──▶ ELIMINATED ──▶ (PAID | done)
                 │           └──▶ REBUY_ELIGIBLE ──▶ (SEATED via re-entry | ELIMINATED)
                 │
REGISTERED/SEATED ──▶ WITHDRAWN         (cancel registration before start)
ELIMINATED ──▶ PAID                      (finished in the money, settled)
```

| State | Meaning | May transition to |
|---|---|---|
| `REGISTERED` | Paid entry fee; awaiting seat | `SEATED`, `WITHDRAWN` |
| `SEATED` | Assigned a table + seat; awaiting first action | `ACTIVE`, `WITHDRAWN` |
| `ACTIVE` | Playing; has chips | `DISCONNECTED`, `ELIMINATED`, `REBUY_ELIGIBLE` |
| `DISCONNECTED` | Temporarily offline; seat + chips retained; auto-fold/check | `ACTIVE`, `ELIMINATED` |
| `ELIMINATED` | Chips 0, hand settled; finishing place assigned | `PAID`, `REBUY_ELIGIBLE`, (done) |
| `REBUY_ELIGIBLE` | Busted within re-entry window; may re-enter | `SEATED` (new entry), `ELIMINATED` (final) |
| `WITHDRAWN` | Cancelled registration before start; fee refunded | (terminal) |
| `PAID` | Prize credited to wallet | (terminal) |

Rules:

- **TNMT-PSTATE-001** `DISCONNECTED` is a **flag-like** state that never releases the seat or returns
  chips (RECONNECT parity with the cash lifecycle). Blinds/antes are still posted.
- **TNMT-PSTATE-002** `ELIMINATED` is only entered from a **fully settled** hand with `chips == 0`.
- **TNMT-PSTATE-003** A re-entry is a **new** entry row (fresh `REGISTERED → SEATED`), not a mutation
  of the busted entry. The busted entry stays `ELIMINATED` (with a place, unless a later re-entry
  keeps the player alive — finishing place is assigned per player only on their *final* bust).
- **TNMT-PSTATE-004** `WITHDRAWN` is only reachable before `STARTING` (registration cancel); after
  start you can only bust or win, never withdraw for a refund (except a whole-tournament cancel).
- **TNMT-PSTATE-005** `PAID` is terminal and set exactly once by idempotent settlement.

## 3. Invariants checked in tests

- **TNMT-STATE-INV-001** From any state, the set of reachable states is closed under the transition
  table (no orphan states, no transition into a terminal that then transitions out).
- **TNMT-STATE-INV-002** `REGISTRATION_OPEN` is the only state that always allows registration;
  late-reg widens it under a deadline gate, nothing narrows the pre-start refund guarantee.
- **TNMT-STATE-INV-003** Exactly one player-terminal outcome per entry: `WITHDRAWN`, `PAID`, or an
  `ELIMINATED` that is not in the money (out-of-the-money bust).
