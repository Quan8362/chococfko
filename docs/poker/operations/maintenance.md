# Poker Maintenance Mode

Graduated, **server-enforced** service-status control for Chợ Cóc FKO Poker. It lets an
administrator wind the feature down in steps — from "browse-only lobby" all the way to
"emergency shutdown" — without ever abruptly losing an active stack or moving coins.

- **Pure resolver:** [`lib/games/poker/maintenance.ts`](../../../lib/games/poker/maintenance.ts) (unit-tested in `maintenance.test.ts`).
- **Server enforcement:** [`app/games/poker/access.ts`](../../../app/games/poker/access.ts) → `checkPokerCapability()`.
- **Config:** environment variables (same model as every poker feature flag — see [reporting.md](./reporting.md) and `lib/games/poker/flags.ts`).

## Why this exists

`POKER_BLOCK_NEW_JOINS` (a single boolean freeze) and `POKER_BETA_MAINTENANCE` (the beta
wind-down strip) are all-or-nothing. Real operations need **graduated** control: a planned
upgrade, an outage, a coin-integrity investigation, and an emergency each want a different
amount of the feature left running. Maintenance mode is that dial.

## The modes

`POKER_MAINTENANCE_MODE` (unset/`normal`/`off` ⇒ no wind-down). Ordered least → most restrictive:

| Mode | New table (`create`) | Join seat (`join`) | Browse lobby / spectate / enter | Intended use |
|---|---|---|---|---|
| `normal` | flags decide | flags decide | flags decide | Steady state. |
| `read_only_lobby` | ❌ | ❌ | ✅ | Public showcase / soft pause: look, don't touch. |
| `no_new_tables` | ❌ | ✅ (existing tables) | ✅ | Cap growth; let running tables fill/continue. |
| `no_new_joins` | ❌ | ❌ | ✅ | Freeze new commitments; running hands keep going. |
| `finish_active_hands` | ❌ | ❌ | ✅ | **Drain**: same gate as above, but the declared intent is to wait for live hands to complete before escalating. |
| `full_maintenance` | ❌ | ❌ | only `enter` (maintenance screen) | Feature paused; players can still see status + let their current hand finish. |
| `emergency_shutdown` | ❌ | ❌ | ❌ | Hard kill: feature fully unreachable. |

Notes:

- **A blocked `create`/`join` is explained to the user with the existing translated code
  `poker_joins_frozen`; a blocked read capability uses `poker_feature_off`.** No new i18n keys.
- `read_only_lobby` is deliberately *stricter on joining* than `no_new_tables` — the tiers are an
  ops severity ordering, not a strict capability lattice. Pick the row whose columns match what you
  want, not by "number".
- **Fail-closed:** any unrecognised / mistyped value of `POKER_MAINTENANCE_MODE` resolves to
  `full_maintenance`, never to `normal`. A typo in a wind-down switch must never read as "open".

## What a mode does and does NOT do

**Does:** gate *new* commitments (and, at the two severe tiers, read access) for **everyone**
(mirrors `POKER_BLOCK_NEW_JOINS`). Admins operate ops from `/admin/poker/*`, which is gated by
`ADMIN_EMAILS` and is **not** affected by these gameplay capability gates.

**Does NOT:** settle, cancel, or freeze a live hand, and never moves coins. Running hands drain
naturally through the authoritative engine, so **no player loses an active stack** because a mode
was set. Winding a specific table down is a separate, audited admin action
(`poker_admin_close_table`, `poker_admin_freeze_hand`, `poker_admin_refund_hand`).

## Composition (most-restrictive-wins)

`checkPokerCapability(cap)` returns the **intersection** of three layers — if any one blocks, the
capability is blocked:

```
final = flags/viewer gate  ∧  maintenanceGate(POKER_MAINTENANCE_MODE, cap)  ∧  POKER_BETA_MAINTENANCE
```

A mode can only ever be *more* restrictive than the flags — it never grants something the flags
already deny.

## Config variables

| Env | Purpose |
|---|---|
| `POKER_MAINTENANCE_MODE` | The tier (table above). Unset ⇒ `normal`. |
| `POKER_MAINTENANCE_MESSAGE` | Display-only banner/screen text (admin-authored, one clear sentence). Not localized. |
| `POKER_MAINTENANCE_ETA` | Optional ISO-8601 estimated return time, display-only. Empty ⇒ "no estimate". |

`resolveMaintenance(env)` returns `{ mode, active, message, etaIso }`, exposed on `PokerAccess.maintenance`
so the UI can render the banner/screen. `active` is simply `mode !== 'normal'`.

## How to set / clear a mode (production)

Configuration is **environment-variable driven**, exactly like the feature flags — there is no
runtime DB toggle, so changing a mode is a config change, not a data write.

1. Set `POKER_MAINTENANCE_MODE` (and optionally `POKER_MAINTENANCE_MESSAGE` / `_ETA`) in the Vercel
   **Production** environment for the `chococfko` project.
2. Redeploy (or trigger a redeploy) so the new env is live. The server picks it up on the next
   request — enforcement is immediate and authoritative; no client action can bypass it.
3. To **escalate** during a drain: `no_new_joins` → wait for `poker_hands.phase NOT IN
   ('COMPLETED','CANCELLED')` to reach zero for the target scope → `full_maintenance`.
4. To **lift**: set `POKER_MAINTENANCE_MODE=normal` (or unset it) and redeploy.

> Because a mode never moves coins or forces hand state, setting and clearing it is safe and
> reversible. The irreversible actions (close table, refund) remain explicit, audited RPCs.

## Recommended escalation ladder

```
normal
  → no_new_tables        (stop growth; investigate)
  → no_new_joins         (freeze new commitments)
  → finish_active_hands  (drain: watch live-hand count fall to 0)
  → full_maintenance     (paused; players see the status screen)
  → emergency_shutdown   (only for SEV-0 / data-integrity: hard kill)
```

Prefer the **lowest** tier that solves the problem. `emergency_shutdown` is reserved for a
private-card exposure or a coin-integrity breach where continued reads are themselves unsafe — see
[incident-response.md](./incident-response.md) SEV-0/SEV-1.

## Related

- [incident-response.md](./incident-response.md) — severity ladder + when to reach for which mode.
- [deployment-rollback.md](./deployment-rollback.md) — using maintenance mode during a rollback.
- [runbooks/feature-flag-rollback.md](./runbooks/feature-flag-rollback.md) — flag/kill-switch procedure.
- [runbooks/supabase-degradation.md](./runbooks/supabase-degradation.md), [runbooks/vercel-degradation.md](./runbooks/vercel-degradation.md).
