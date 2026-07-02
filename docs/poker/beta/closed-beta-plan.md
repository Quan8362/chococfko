# Chợ Cóc FKO Poker — Closed Beta Plan

Status: **prepared, NOT started.** No cohort has been opened, no tester invited, and the
`POKER_CLOSED_BETA_ENABLED` flag is OFF. This is the operating plan for a controlled,
invitation-only Closed Beta of the play-money NLHE cash game — the stage **after** the
[controlled Alpha](../alpha/alpha-plan.md).

> Do not enable the Closed Beta publicly. Do not invite users automatically. Do not claim
> Beta success before real usage data exists.

---

## 1. Goal

Take the poker feature from a tiny Alpha to a larger — but still private and reversible —
population, organised into **cohorts** that are opened **manually**. The Beta exists to
build confidence, on real devices and networks, that the game is correct, coin-safe,
private, understandable and resilient, before any public launch is considered.

**Non-goals:** public launch, bots, tournaments, leaderboards, marketing. Those stay off
(`bot`/`tournament` are hard-off in code).

---

## 2. What is already enforced in code (guardrails)

| Guardrail | Where |
|---|---|
| Server/DB is the only source of truth | `app/games/poker/actions.ts` + DEFINER RPCs |
| Hole cards never in public/broadcast payloads | `fetchTableState` / `assertSnapshotPrivacy` |
| Integer-only coin math | economy + settlement RPCs |
| Feature dark by default | `lib/games/poker/flags.ts` (every flag OFF) |
| Beta reachable by cohort allowlist only | `POKER_CLOSED_BETA_ENABLED` + cohort env lists |
| Per-tester suspend (immediate) | `POKER_BETA_SUSPENDED` (access) / `restrictPlayer` (gameplay) |
| One-time terms acknowledgement before playing | `poker_beta_acknowledgements` + `getBetaTermsAck` |
| Instant wind-down without losing stacks | `POKER_BLOCK_NEW_JOINS` freeze |
| In-game categorised feedback with safe context | `bugReport.ts` allowlist + `feedbackCategory` |
| Admin dashboard (roster, terms, feedback, success) | `/admin/poker/beta` |

---

## 3. Access model (server-enforced)

Visibility is resolved server-side in `app/games/poker/access.ts` → `getPokerAccess`, on top
of the pure logic in `lib/games/poker/flags.ts` (`pokerVisibleTo`). Client-side hiding is
never the boundary.

Resolution order:

1. **Admin** (`ADMIN_EMAILS`) → always in.
2. **Suspended** (`POKER_BETA_SUSPENDED`) → locked out (non-admins), regardless of cohort.
3. **Alpha mode ON** (`POKER_ALPHA_MODE=1`) → alpha allowlist only (turn OFF for Beta).
4. **Closed Beta ON** (`POKER_CLOSED_BETA_ENABLED=1`) → **cohort members only** (the public
   master flag `POKER_ENABLED` is overridden — the public stays locked out).
5. Otherwise → `POKER_ENABLED` decides.

Per-capability flags still apply on top (create / public lobby / private / spectator), and
the join **freeze** (`POKER_BLOCK_NEW_JOINS`) overrides create/join for everyone.

A typical Closed-Beta env baseline:

```
POKER_CLOSED_BETA_ENABLED=1
POKER_ALPHA_MODE=0              # beta supersedes alpha; keep alpha off
POKER_ENABLED=0                # public stays dark
POKER_CREATE_TABLE_ENABLED=1
POKER_PUBLIC_LOBBY_ENABLED=1
POKER_PRIVATE_TABLE_ENABLED=1
POKER_SPECTATOR_ENABLED=1
POKER_BLOCK_NEW_JOINS=0        # 1 only when winding down / pausing the beta

# Cohorts (comma-separated emails) — open ONE at a time, in order:
POKER_BETA_COHORT_INTERNAL=admin1@fko.com
POKER_BETA_COHORT_TECHNICAL=
POKER_BETA_COHORT_EXPERIENCED=
POKER_BETA_COHORT_NEW=
POKER_BETA_COHORT_COMMUNITY=

POKER_BETA_SUSPENDED=          # emails locked out immediately
POKER_BETA_STATUS_MESSAGE=     # optional service-status strip (any text)
POKER_BETA_MAINTENANCE=0       # 1 shows the maintenance strip
```

Feature flags (all resolved in `lib/games/poker/flags.ts`):

- `poker_enabled` → `POKER_ENABLED`
- `poker_closed_beta_enabled` → `POKER_CLOSED_BETA_ENABLED` (**new this phase**)
- `poker_create_table_enabled` → `POKER_CREATE_TABLE_ENABLED`
- `poker_public_lobby_enabled` → `POKER_PUBLIC_LOBBY_ENABLED`
- `poker_private_table_enabled` → `POKER_PRIVATE_TABLE_ENABLED`
- `poker_spectator_enabled` → `POKER_SPECTATOR_ENABLED`
- `poker_new_joins_enabled` → governed by `POKER_BLOCK_NEW_JOINS` (new joins allowed when the
  freeze is **off**; set `POKER_BLOCK_NEW_JOINS=1` to disable new joins). One switch, no
  duplicate flag, so a freeze is unambiguous.

---

## 4. Cohorts

See [cohorts.md](./cohorts.md). Five cohorts, opened **manually** in order. Each has entry
and exit criteria; an earlier cohort must clear its exit criteria before the next opens.

---

## 5. Instrumentation

| Signal | Source |
|---|---|
| Cohort roster, terms acks, feedback-by-category, success eval | `/admin/poker/beta` |
| Live tables, seats, hands, integrity signals | `/admin/poker`, `/admin/poker/observability` |
| Incidents / anti-abuse / restrictions | `/admin/poker/incidents`, `/admin/poker/anti-abuse` |
| In-game tester reports (categorised) | `poker_bug_reports` → beta dashboard |
| Coin integrity / conservation | `poker_ops_events` → observability |

---

## 6. Success criteria

See [success-criteria.md](./success-criteria.md). Measured only — never fabricated. The
admin dashboard shows "Not measured" until real data exists.

---

## 7. Safety & rollback

See [support-process.md](./support-process.md) and [rollback.md](./rollback.md). Every
safety control already exists as an admin action or an env flag.

---

## 8. Roles

- **Release manager / Beta lead** — owns go/no-go per cohort, the dashboard, the flags.
- **Ops** — flips env flags, applies migrations, runs the freeze, executes rollback.
- **Support triage** — classifies feedback, escalates incidents. See support-process.md.
- **Testers** — play scenarios, file categorised in-game reports. See [tester-guide.md](./tester-guide.md).
