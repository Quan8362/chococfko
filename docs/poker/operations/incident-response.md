# Poker Incident Response

How Chợ Cóc FKO Poker incidents are classified, owned, communicated, recovered, and reviewed. It
sits on top of the tooling already in the repo — it adds process, not a new vendor.

**Core principle:** the server/DB is the sole authority. Nobody edits a wallet balance or a game
row by hand. Every coin correction flows through an **idempotent, audited** RPC tied to an
incident case. Every admin action writes a `poker_admin_audit` row.

## Tooling reference (what you operate)

| Concern | Mechanism |
|---|---|
| Durable failure signals | `poker_ops_events` (kinds: `settlement_failure`, `coin_conservation_failure`, `rls_denial`, `frozen_hand`, `reconnect_failure`, `realtime_subscription_error`, `abandoned_table`, …) |
| Incident cases (FSM) | `poker_incident_cases` — `OPEN → INVESTIGATING → {RESOLVED\|DISMISSED}`; `REFUNDED` only via the refund RPC. RESOLVED/DISMISSED need a resolution note. |
| Admin audit (immutable) | `poker_admin_audit` (written by every `poker_admin_*` RPC) |
| Coin invariants | `lib/games/poker/coinIntegrity.ts` + the 15-min cron `GET /api/cron/poker-integrity` (`[poker-alert]` logs) |
| Dashboards | `/admin/poker/{metrics,observability,incidents,integrity,hands,anti-abuse}` |
| Safe wind-down | `POKER_MAINTENANCE_MODE`, `POKER_BLOCK_NEW_JOINS`, `POKER_ENABLED=0` (kill switch) |
| Table/hand controls | `poker_admin_pause_table`/`_resume_table`/`_mark_closing`/`_close_table`/`_force_sit_out`/`_freeze_hand`/`_refund_hand` |

## Severity ladder

| SEV | Definition | Owner | Response time | First move |
|---|---|---|---|---|
| **SEV-0** | Private-card exposure or critical security hole (RLS hole leaking hole cards, auth bypass) | Incident Commander + Security | **Immediate (≤15 min)** | `POKER_MAINTENANCE_MODE=emergency_shutdown` (or `POKER_ENABLED=0`), then investigate. |
| **SEV-1** | Coin-integrity or duplicate-settlement failure (conservation breach, double payout) | Incident Commander + DB Recovery | ≤30 min | Freeze the affected hand(s), stop new joins, **preserve evidence**, no auto-fix. |
| **SEV-2** | Widespread realtime / reconnect failure | On-call Ops | ≤1 h | Assess scope, wind down to `no_new_joins` if worsening, keep running hands alive. |
| **SEV-3** | Limited gameplay or device-specific failure | On-call Ops | Same business day | Reproduce, scope, patch forward. |
| **SEV-4** | Minor visual / translation problem | Product/Eng backlog | Next release | Ticket + i18n fix (all 5 message files). |

### Per-severity playbook

For **every** SEV-0/1/2 open a `poker_incident_cases` case (`poker_admin_open_incident`) up front —
it is the container for evidence, notes, and the eventual resolution/refund.

**SEV-0 — private-card / security exposure**
- **Owner:** Incident Commander + Security. **Immediate.**
- **Immediate action:** wind down hard — `POKER_MAINTENANCE_MODE=emergency_shutdown` and, if the
  exposure is via reads at all, `POKER_ENABLED=0`. Continued reads are themselves unsafe.
- **Communication:** short, honest status via `POKER_MAINTENANCE_MESSAGE`; notify leadership.
- **Evidence:** capture the offending request/RLS policy; **never** paste card values into the case
  — `scrubDetail`/`assertDetailClean` keep audit/ops payloads clean, and `poker_admin_reveal_hole_cards`
  (terminal hands only, audited) is the *only* sanctioned reveal.
- **Recovery:** patch the RLS/policy via a **forward** migration; verify with an RLS probe before
  lifting the shutdown.
- **Review:** mandatory blameless post-incident within 48 h. See [runbooks/rls-incident.md](./runbooks/rls-incident.md).

**SEV-1 — coin-integrity / duplicate settlement**
- **Owner:** Incident Commander + DB Recovery. ≤30 min.
- **Immediate action:** `poker_admin_freeze_hand` the affected hand(s); `POKER_MAINTENANCE_MODE=no_new_joins`
  to stop new exposure. **Do not attempt a manual balance fix.**
- **Evidence:** the integrity report (code: `CONSERVATION_MISMATCH`, `POT_CONSTRUCTION_MISMATCH`,
  `DUPLICATE_SETTLEMENT`, `LEDGER_IMBALANCE`, …), the hand replay (`/admin/poker/hands/[handId]`),
  and the relevant `coin_ledger` rows.
- **Recovery:** correct only via the **idempotent, audited** refund workflow tied to the case — see
  [refunds.md](./refunds.md). Duplicate settlement is guarded by the settlement lock; a duplicated
  admin click never double-pays.
- **Review:** mandatory. Runbooks: [coin-conservation-failure.md](./runbooks/coin-conservation-failure.md),
  [duplicate-settlement.md](./runbooks/duplicate-settlement.md), [settlement-failure.md](./runbooks/settlement-failure.md).

**SEV-2 — realtime / reconnect outage**
- **Owner:** On-call Ops. ≤1 h.
- **Immediate action:** confirm scope on `/admin/poker/metrics` (reconnect success rate,
  `realtime_subscription_error` / `reconnect_failure` counts). If degrading, `no_new_joins`; keep
  running hands alive (the engine + turn clock are server-authoritative and survive a client drop).
- **Recovery:** the realtime layer self-heals (recovery watchdog, `state_version` reconciliation).
  If Supabase Realtime itself is down, follow [runbooks/supabase-degradation.md](./runbooks/supabase-degradation.md).
- **Review:** recommended if user-visible > 15 min.

**SEV-3 / SEV-4** — normal ticketed flow; no wind-down. SEV-4 fixes must touch all 5 `messages/*.json`.

## Roles

- **Incident Commander (IC):** owns the incident, decides severity + wind-down tier, coordinates.
- **DB Recovery Engineer:** owns anything touching `coin_ledger` / `game_wallets` / settlement.
- **Security:** owns SEV-0 and any RLS/auth exposure.
- **Comms:** owns the user-facing status message and stakeholder updates.
- **Scribe:** keeps the `poker_incident_cases` notes current (`poker_admin_add_incident_note`).

## Incident lifecycle

```
detect ──▶ open case (poker_admin_open_incident) ──▶ classify SEV ──▶ contain (maintenance/freeze)
   │                                                                        │
   └── evidence (ops_events, replay, integrity report) ◀────────────────────┘
                                   │
        recover ──▶ (refund? → refunds.md) ──▶ verify (conservation, SLO green)
                                   │
        transition case: RESOLVED | REFUNDED | DISMISSED (note required) ──▶ post-incident review
```

- **Open/transition/close** via `poker_admin_open_incident`, `poker_admin_transition_incident`,
  `poker_admin_add_incident_note`. `RESOLVED`/`DISMISSED` require a resolution note (enforced in
  `lib/games/poker/admin.ts`). `REFUNDED` is reachable **only** through `poker_admin_refund_hand`,
  so reaching it always corresponds to real, audited coin movement.

## Evidence & privacy rules

- Preserve, never mutate: `poker_ops_events`, `poker_admin_audit`, `poker_incident_cases`,
  affected `poker_hands`/`poker_actions`/`poker_hand_settlements`, and `coin_ledger` rows.
- **Never** put hole cards / decks / seeds / tokens into a case note, audit detail, log line, or
  screenshot. Redaction is enforced in code; do not defeat it.
- A hand replay from the public action log (`/admin/poker/hands/[handId]`) never needs card values.

## Post-incident review (SEV-0/1 mandatory, SEV-2 recommended)

Blameless. Capture: timeline, detection gap, root cause, coins affected + corrected, why it wasn't
caught earlier, and concrete follow-ups (new alert, new test, new runbook step). File follow-ups as
tracked work. Update the relevant runbook if reality differed from the doc.

## Related

- [maintenance.md](./maintenance.md) · [refunds.md](./refunds.md) · [reporting.md](./reporting.md) ·
  [backup-and-restore.md](./backup-and-restore.md) · [deployment-rollback.md](./deployment-rollback.md) ·
  [runbooks/](./runbooks/README.md) · [staging-drills.md](./staging-drills.md)
