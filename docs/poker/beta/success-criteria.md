# Closed Beta — Success Criteria

Measured, not asserted. The targets below are encoded in `lib/games/poker/beta.ts`
(`BETA_SUCCESS_TARGETS` + `evaluateBetaSuccess`) and evaluated against **real** metrics on
`/admin/poker/beta`. Anything not yet measured is reported as **"Not measured" ("—")** — it is
never counted as passed. **Do not claim Beta success before real usage data exists.**

---

## Hard safety invariants (must be exactly zero)

Non-negotiable. Any non-zero value is a **stop-the-beta** condition (`safetyBreached` on the
dashboard). Independent of the tunable targets.

| Invariant | Target | Source of truth |
|---|---|---|
| Private-card exposure | 0 | `assertSnapshotPrivacy` + privacy review; no positive counter → reported "unknown" until a signal exists (never assumed 0) |
| Coin-conservation failure | 0 | `poker_ops_events` (`coin_conservation_failure`) |
| Duplicate settlement | 0 | settlement idempotency; reported "unknown" until an integrity signal exists |

> The dashboard marks these with `*`. "Unknown" here means we have **no positive measurement**
> — it must be resolved to a confirmed zero (by review/instrumentation) before sign-off, not
> assumed.

---

## Tunable rollout targets

| Criterion | Default target | Notes |
|---|---|---|
| Minimum completed hands | 2,000 | from `poker_hands` phase = COMPLETED |
| Minimum unique testers | 20 | proxied by distinct terms-acknowledgers (current version) |
| Device coverage (classes) | 3 | desktop + tablet + phone observed in reports |
| Reconnect success rate | ≥ 0.99 | requires reconnect instrumentation (currently unknown) |
| Hand completion rate | ≥ 0.99 | completed ÷ (completed + stuck/abandoned) |
| Action success rate | ≥ 0.995 | successful actions ÷ attempts |
| Max critical (blocker) bugs open | 0 | open `poker_bug_reports` severity=blocker |
| Max high (major) bugs open | 3 | open `poker_bug_reports` severity=major |

Targets are tunable — pass a custom `BetaSuccessTargets` to `evaluateBetaSuccess` if a cohort
warrants different thresholds. The hard invariants are not tunable.

---

## User-understanding targets (qualitative, gathered via UX feedback)

- Testers can state the current pot and the amount to call without help.
- Testers know whose turn it is and the min/max raise.
- New-player cohort files no blocker/major bug caused by misreading the table.

Captured through the in-game "UX feedback" report kind (rating + category) and reviewed by
the Beta lead — not auto-scored.

---

## What the dashboard does NOT do

- It does not fabricate rates it cannot measure (they show "—").
- It does not mark the Beta "successful"; it reports per-criterion status and whether any hard
  invariant is breached. **Sign-off is a human decision**, recorded per cohort exit.
