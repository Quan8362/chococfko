# Chợ Cóc FKO Poker — Controlled Alpha Plan

Status: **prepared, NOT started**. No tester has been invited and no Alpha flag has been
enabled. This document is the operating plan for a limited, invitation-only real-player
Alpha of the play-money NLHE cash game.

---

## 1. Goal

Validate the poker feature with a small group of approved testers on real devices and
networks **before** any public exposure. The Alpha exists to surface correctness, integrity,
sync, reconnect, responsiveness, and comprehension problems while the blast radius is tiny.

The Alpha must validate:

- Poker rule correctness (betting, pots, side pots, showdown, refunds, split pots)
- Coin integrity (conservation, no duplicate settlement, no lost stacks)
- Realtime synchronization (all players see one authoritative state)
- Reconnect behavior (no stuck hands, no lost stack)
- Responsive landscape gameplay (2–6 seats, phones → tablet → desktop)
- User understanding (call/raise amounts, pots, current actor)
- Action-control usability (fold/check/call/raise/all-in, slider, presets)
- Performance on real devices and networks

**Non-goals:** public launch, bots, tournaments, leaderboards, marketing. Those stay off.

---

## 2. Guardrails (already enforced in code)

| Guardrail | Where |
|---|---|
| Server/DB is the only source of truth | `app/games/poker/actions.ts` + DEFINER RPCs |
| Hole cards never in public/broadcast payloads | `fetchTableState` / `assertSnapshotPrivacy` |
| Integer-only coin math | economy + settlement RPCs |
| Feature is dark by default | `lib/games/poker/flags.ts` (every flag OFF) |
| Alpha reachable by allowlist only | `POKER_ALPHA_MODE` + `POKER_ALPHA_TESTERS` |
| Instant wind-down without losing stacks | `POKER_BLOCK_NEW_JOINS` freeze |
| In-game bug reporting w/ safe context | `lib/games/poker/bugReport.ts` (allowlist) |

---

## 3. Access model

Access is **server-enforced** (`app/games/poker/access.ts` → `getPokerAccess`). Client-side
hiding is never the boundary.

Visibility resolves as:

1. **Admin** (`ADMIN_EMAILS`) → always in (admin-only production-visibility stage).
2. **Alpha mode ON** (`POKER_ALPHA_MODE=1`) → in **only** if the viewer's email is on
   `POKER_ALPHA_TESTERS`. The public master flag (`POKER_ENABLED`) is *overridden* — the
   public stays locked out even if it is on.
3. **Alpha mode OFF** → legacy behaviour: visible iff `POKER_ENABLED` is on (or admin).

Per-capability flags still apply on top (create / public lobby / private / spectator). During
Alpha a typical config is:

```
POKER_ALPHA_MODE=1
POKER_ENABLED=0                 # public stays dark
POKER_CREATE_TABLE_ENABLED=1    # testers may host
POKER_PUBLIC_LOBBY_ENABLED=1    # testers may browse/join
POKER_PRIVATE_TABLE_ENABLED=1   # optional
POKER_SPECTATOR_ENABLED=1       # optional
POKER_BLOCK_NEW_JOINS=0         # 1 only when winding down
POKER_ALPHA_TESTERS=tester1@…,tester2@…
```

See [test-account-policy.md](./test-account-policy.md) for how testers are added/removed.

### Emergency switches (all env-only, take effect on next request)

| Need | Set |
|---|---|
| Disable new tables | `POKER_CREATE_TABLE_ENABLED=0` |
| Disable the lobby (browse/join) | `POKER_PUBLIC_LOBBY_ENABLED=0` |
| **Freeze**: keep running tables & stacks, block ALL new joins/sits/creates | `POKER_BLOCK_NEW_JOINS=1` |
| Kill everything (hard off, admins only) | `POKER_ALPHA_MODE=0` and `POKER_ENABLED=0` |

The freeze is the safe way to wind down: existing hands finish and players cash out normally;
no new coins get committed. Close the Alpha only after tables have naturally emptied.

---

## 4. Environments

- **Staging / preview** (preferred): a Vercel preview or the admin-only production stage is
  the primary Alpha surface. Testers hit it with their approved accounts.
- **Admin-only production**: admins can validate on prod with `POKER_ALPHA_MODE=0` (admins
  bypass) before testers are let in.
- **Production Alpha (optional)**: only if a preview cannot reproduce a device/network issue.
  Turn on `POKER_ALPHA_MODE=1` with the allowlist so the public is never exposed.

---

## 5. Instrumentation

| Signal | Source |
|---|---|
| Live tables, seats, hands, pot, state version | `/admin/poker` overview |
| Integrity events (coin/settlement/sequence/reconnect/frozen) | `poker_ops_events` → `/admin/poker/observability` + `/admin/poker/alpha` |
| Incidents / anti-abuse | `/admin/poker/incidents`, `/admin/poker/anti-abuse` |
| Session throughput + bug analytics | `/admin/poker/alpha` (this phase) |
| In-game tester reports | `poker_bug_reports` → `/admin/poker/alpha` |

---

## 6. Session targets (human targets — NOT results)

These are goals for the Alpha to *aim at*; they are not claimed as achieved.

- 1,000–3,000 completed hands
- ≥ 100 all-in hands
- ≥ 50 side-pot hands
- ≥ 100 reconnect scenarios
- ≥ 50 timeout scenarios

Track progress on `/admin/poker/alpha` (completed hands, all-in hands, side-pot hands,
timeout actions, reconnect failures).

---

## 7. Exit

The Alpha may only advance past this stage when the [exit-criteria.md](./exit-criteria.md)
blockers are all clear. Any single unresolved exit blocker halts advancement.

---

## 8. Roles

- **Alpha lead / QA**: owns scenarios, triage, the dashboard, go/no-go.
- **Ops**: flips env flags, applies migrations, runs the freeze if needed.
- **Testers**: run scenarios, file in-game reports. See [tester-guide.md](./tester-guide.md).
