# Closed Beta — Cohorts

Five cohorts, opened **manually in order**. Nothing advances automatically. The canonical
order and the entry/exit criteria live in code as data (`COHORT_GATES` in
`lib/games/poker/beta.ts`) and are surfaced on `/admin/poker/beta`.

Each cohort is a comma-separated email allowlist in its own env var. A tester in more than
one list is assigned to the **first (most-trusted)** cohort. To open a cohort, add emails to
its env var and redeploy/restart; to advance, add the next cohort's emails once the current
cohort's **exit criteria** are all clear.

| # | Cohort | Env var | Purpose |
|---|---|---|---|
| 1 | Internal admins | `POKER_BETA_COHORT_INTERNAL` | Core team smoke-test on prod-like env |
| 2 | Technical testers | `POKER_BETA_COHORT_TECHNICAL` | Devs/QA hunt correctness & edge cases |
| 3 | Experienced poker players | `POKER_BETA_COHORT_EXPERIENCED` | Rule correctness on real hands |
| 4 | New poker players | `POKER_BETA_COHORT_NEW` | Comprehension / usability signal |
| 5 | Small invited community | `POKER_BETA_COHORT_COMMUNITY` | Scale & realistic mix |

Suspend anyone immediately (any cohort) by adding their email to `POKER_BETA_SUSPENDED` —
they are locked out at the access layer on the next request without editing a cohort list.

---

## Entry & exit criteria

> These are the human gates. **Do not advance a cohort until the current one's exit criteria
> are all clear.** A single unmet exit criterion halts advancement.

### 1. Internal admins
**Entry**
- All poker migrations applied to the target environment and verified.
- Feature flags set to the closed-beta baseline (public master flag OFF).
- Admin dashboards (overview, metrics, integrity, beta) load with live data.

**Exit**
- A full hand plays end-to-end (deal → showdown → settlement) with no coin drift.
- Reconnect mid-hand restores authoritative state with no stuck hand.
- Zero private-card exposure observed in any payload/log.
- No open blocker bug.

### 2. Technical testers
**Entry**
- internal_admin exit criteria all cleared.
- In-game report flow files a categorised report that lands on the beta dashboard.

**Exit**
- All-in + side-pot hands settle correctly across ≥2 devices.
- Timeout → fold/auto-action behaves per spec.
- No open blocker bug; ≤ agreed high-bug count.
- Zero coin-conservation failures on the dashboard.

### 3. Experienced poker players
**Entry**
- technical exit criteria all cleared.
- Known-issues page published and linked from the beta banner.

**Exit**
- Rule correctness confirmed on real hands (split pots, refunds, min-raise).
- Action success rate at/above target.
- No open blocker bug.

### 4. New poker players
**Entry**
- experienced exit criteria all cleared.
- Rules + learn links reachable from every table.

**Exit**
- Comprehension target met (players understand call/raise amounts, pot, current actor).
- No blocker/major bug from confusion-driven mistakes.

### 5. Small invited community
**Entry**
- new_players exit criteria all cleared.
- Support triage cadence in place; welcome + bug-report guides sent.

**Exit**
- Beta success criteria met across the whole tester population.
- Go/no-go decision recorded for the next stage.

---

## Adding / removing a tester

1. Edit the cohort env var (add/remove the email) in Vercel → redeploy or restart.
2. Membership + assigned cohort update on the next request (server-resolved).
3. The `/admin/poker/beta` roster shows the de-duplicated partition and suspended testers.
4. Removing a tester from every cohort revokes access; their acknowledgement row (if any)
   is retained for audit and coins remain in their wallet.
