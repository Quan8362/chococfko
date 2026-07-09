# Poker / Tournament SEV-1 Incident Runbook (27G-M1)

Operational runbook for the zero-tolerance ("must page an operator") poker incidents that are
grounds for pausing or rolling back a public launch. Closes public-launch blocker **B1** (rollback
incidents were detectable but not *actively observable*) and pairs with the public launch-shape
policy (**B2**, see the bottom section).

This document is internal ops guidance — it references only codes, ids and env-var **names**, never
secrets, cards, seeds, tokens, emails, IPs or serialized state.

---

## 1. Incident codes & severity

Every SEV-1 shares one contract (`lib/games/poker/incident.ts`). Severity is always **SEV1**.

| Code | Meaning | Primary emitter |
|---|---|---|
| `PKR_SEV1_PRIVATE_STATE_LEAK` | A snapshot/view would expose private state (foreign hole cards, own-seat mismatch) | LIVE — `app/games/poker/actions.ts` (`assertSnapshotPrivacy`), `tournament-actions.ts` (`assertTournamentViewPrivacy`) |
| `PKR_SEV1_CROSS_USER_ACTION` | An action attributed to a seat the actor does not own | SCHEDULED — integrity cron (`detectCrossUserActions`) |
| `PKR_SEV1_ECONOMY_NOT_CONSERVED` | money-in ≠ money-out (conservation / reconcile / pot / negative / non-integer) | LIVE — cash + tournament settlement conservation branch; SCHEDULED — integrity cron |
| `PKR_SEV1_DUPLICATE_PAYOUT` | More than one payout observed for one hand/entry | SCHEDULED — integrity cron (`DUPLICATE_SETTLEMENT` map + `detectDuplicatePayouts`) |
| `PKR_SEV1_DUPLICATE_REFUND` | More than one refund observed for one entry | SCHEDULED — integrity cron (`detectDuplicatePayouts`) |
| `PKR_SEV1_DUPLICATE_ACTION` | A duplicate action accepted despite idempotency | SCHEDULED — integrity cron (`detectDuplicateActions`) |
| `PKR_SEV1_DUPLICATE_ACTIVE_HAND` | More than one active (non-terminal) hand at one table | SCHEDULED — integrity cron (`detectDuplicateActiveHands`) |
| `PKR_SEV1_CONTRADICTORY_SETTLEMENT` | Settlement state contradicts itself (e.g. ineligible-seat payout) | SCHEDULED — integrity cron |

**Tripwire note.** Several invariants are *also prevented by construction* at the database layer:
`poker_actions` has `UNIQUE (hand_id, action_seq)` (duplicate action) and `poker_tournament_payouts`
has `UNIQUE (tournament_id, entry_id, kind)` (duplicate payout/refund). Atomic CAS + idempotency keys
prevent duplicate active hands. A detector firing therefore means a construction guarantee was
defeated (a dropped constraint, a migration mistake, a code bug) — exactly what must be paged.

---

## 2. Notifier destination & ownership

Delivery path (`lib/games/poker/incidentNotifierCore.ts`, guarded by
`lib/games/poker/incidentNotifier.ts` → `import 'server-only'`):

1. **Always** a durable structured log line `[poker-sev1] {…}` (Vercel runtime log). This is the
   system of record and is instance-independent. A log-drain alert rule can fire on `[poker-sev1]`.
2. **Best-effort** an operational email through the **existing Resend path** (same as `/feedback`):
   - Sender: `noreply@chococfko.com` (Resend-verified domain).
   - API key: **`RESEND_API_KEY`** (already configured in prod — no new secret).
   - Recipients: **`POKER_SEV1_ALERT_EMAIL`** if set, else **`ADMIN_EMAILS`** (both server-controlled;
     never a client value). No hardcoded recipient.

Ownership: the poker/tournament operator on call (the `ADMIN_EMAILS` list). Delivery is **never** on
the browser; no secret is ever placed in a client bundle (`RESEND_API_KEY` / `ADMIN_EMAILS` are
non-`NEXT_PUBLIC_` and are not inlined client-side).

Optional configuration: `POKER_SEV1_ALERT_EMAIL` — narrows alerts to a dedicated ops inbox. If unset,
alerts go to `ADMIN_EMAILS`. This is the **only** optional new env var; it is not required for
delivery.

---

## 3. Deduplication & cooldown

`lib/games/poker/incidentDedup.ts` (`Sev1Deduper`):

- **Dedupe key** = `code | tournamentId | tableId | handId` (deterministic; no timestamp/count).
- **Cooldown** = 5 minutes per key. The first occurrence notifies; repeats within the window are
  suppressed but **counted** — the next alert says "OCCURRENCES (this window): N".
- **Bounded** to 512 keys with least-recently-touched eviction (no unbounded memory).
- State is **per serverless instance** (not shared). The durable `[poker-sev1]` log line is the
  cross-instance record; dedupe only throttles duplicate *alerts* from one hot instance.

---

## 4. Notifier-failure handling

Alert delivery is **best-effort and never throws** — an email/log failure must never corrupt
gameplay, settlement or the economy:

- Email failure (`RESEND_API_KEY` missing, no recipients, HTTP error, network exception) is logged
  as `[poker-sev1] email_failed …` / `email_exception` and the caller proceeds normally.
- If the incident somehow fails the safety assertion, a payload-free `[poker-sev1] {build_unsafe:true}`
  line is logged and **no** email is sent.

---

## 5. Evidence: allowed vs prohibited

**Allowed in an alert:** incident code, severity, timestamp, occurrence count, opaque correlation ids
(tournament / table / hand UUIDs), integer facts (deltas, counts, seat indexes), a short integrity
slug, build/region.

**Prohibited (stripped + hard-asserted against):** cards, decks, seeds, RNG, tokens, cookies, JWTs,
service-role keys, API keys, passwords, emails, phone, raw IP, SQL fragments, stack traces, and any
serialized private state. The builder allowlists facts to numbers/short slugs, runs the telemetry
redactor, and `assertSev1Safe` re-scans with the same scanners that guard the push path.

---

## 6. Containment & rollback

When a SEV-1 fires:

1. **Confirm** in `[poker-sev1]` logs (grep by `code` + correlation ids) and cross-check
   `/admin/poker/observability` and the `[poker-alert]` integrity-cron summary.
2. **Contain** using the kill switches (Section 8) — narrowest first.
3. **Preserve evidence** — do NOT delete hands/settlements. Use the admin incident case + audited
   refund path (`/admin/poker`) for any coin remediation; refunds are once-only and audited.
4. **Root-cause** the class:
   - `PRIVATE_STATE_LEAK` → the leak was blocked (the snapshot/view was refused); find the wiring
     regression before re-enabling.
   - `ECONOMY_NOT_CONSERVED` / `CONTRADICTORY_SETTLEMENT` → the settle RPC's conservation check held
     (settlement was refused / left for the reaper); reconcile the ledger before resuming.
   - `DUPLICATE_*` → verify the relevant UNIQUE constraint / idempotency key still exists (a firing
     tripwire suggests a dropped constraint or migration drift).
5. **Rollback criteria** — see Section 9.

---

## 7. Rollout pause & rollback criteria

- **Pause the public rollout** (do not enable / re-disable `POKER_TOURNAMENT_ENABLED`) on ANY
  confirmed SEV-1 during a launch window.
- **Roll back the deploy** (fast-forward `main` to the prior commit; Vercel git-linked redeploy) if a
  SEV-1 is caused by the current release and cannot be contained by a flag.
- **Resume** only after: root cause fixed, ledger reconciled, a green integrity-cron run, and a
  passing notifier health check (Section 8).

---

## 8. Kill switches & health check

Kill switches (env; narrowest that contains the incident):

- `POKER_TOURNAMENT_INTERNAL_ALPHA` = (empty) → close the tournament surface for everyone.
- `POKER_TOURNAMENT_ENABLED` — the public tournament flag. **Hard-off this release**; keep OFF.
- `POKER_ENABLED=false` → master kill switch for all poker.

Notifier health check (proves the alert path without a real incident):

```
GET /api/cron/poker-sev1-healthcheck        (Authorization: Bearer $CRON_SECRET)
```

- Sends a `[SEV-1 HEALTHCHECK]` alert (clearly not a real incident) to the approved destination.
- Call it **twice** to verify dedupe: the second call within cooldown returns `suppressed: true` and
  sends no email.

The integrity cron (`GET /api/cron/poker-integrity`, `Bearer $CRON_SECRET`) runs the audit + tripwire
scans and actively routes any breach to the SEV-1 notifier.

---

## 9. Public launch shape (blocker B2)

The public Tournament capability is technically restricted to the ONLY validated format —
**one table, two players, heads-up** — enforced server-side, never client-only:

- Policy: `lib/games/poker/tournament/launchShape.ts` (`validatePublicLaunchShape`): `maxEntries=2`,
  `seatsPerTable=2`, `minEntries=2`, no re-entry, no late registration. A 2-seat/2-entry field can
  never split into more than one table → no balancing / multi-table transition.
- Preset: `TEMPLATE_PUBLIC_HEADS_UP` (config.ts) + the operator create form's "Public heads-up" option
  (locks the seat/entry fields) + localized error `error.public_launch_shape`.
- Enforcement point: `createTournament` (`tournament-actions.ts`) applies the shape whenever
  `pokerTournamentPublicEnabled(flags)` is true (the public flag). While that flag is hard-off,
  internal-alpha / closed-beta 6-max creation is unchanged.
- Bots: tournament bot seats are gated OFF by their own flag (unchanged); the heads-up shape opens
  only the two human seats.
