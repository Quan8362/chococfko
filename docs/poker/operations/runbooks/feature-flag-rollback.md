# Runbook — Feature-Flag Rollback (turning poker gating off safely)

**Severity:** SEV-2 (mitigation tool for many incidents) · **Owner:** Poker on-call · **Related:** [../incident-response.md](../incident-response.md), [../maintenance.md](../maintenance.md), [bad-frontend-deploy.md](./bad-frontend-deploy.md), [supabase-degradation.md](./supabase-degradation.md)

## When to use
You need to reduce exposure without editing game state. Flags gate NEW commitments and access only — they NEVER settle, cancel, or freeze a live hand and never move coins.

## The controls (env vars — only `1/true/on/yes` = ON; all default OFF)
- `POKER_ENABLED` — master kill switch. `0` ships the feature dark for everyone. Blunt; use for SEV-0/SEV-1 containment.
- `POKER_BLOCK_NEW_JOINS` — freezes new create/join for everyone; **running hands are preserved**. Least-disruptive containment.
- `POKER_MAINTENANCE_MODE` — graduated tiers (most-restrictive-wins), preferred over the kill switch:
  `normal` → `read_only_lobby` → `no_new_tables` → `no_new_joins` → `finish_active_hands` → `full_maintenance` → `emergency_shutdown`.
  **Unknown/typo value FAILS CLOSED to `full_maintenance`.** Only gates new commitments and (at the two severe tiers) reads; never touches a live hand or coins. See [../maintenance.md](../maintenance.md).
- Sub-feature flags: `POKER_CREATE_TABLE_ENABLED`, `POKER_PUBLIC_LOBBY_ENABLED`, `POKER_PRIVATE_TABLE_ENABLED`, `POKER_SPECTATOR_ENABLED`.
- Access-cohort flags: `POKER_ALPHA_MODE` + `POKER_ALPHA_TESTERS` (csv), `POKER_CLOSED_BETA_ENABLED`, `POKER_BETA_MAINTENANCE`, `POKER_BETA_STATUS_MESSAGE`.
- Display-only: `POKER_MAINTENANCE_MESSAGE` (banner text), `POKER_MAINTENANCE_ETA` (ISO-8601).

Composition: maintenance mode + the flags + `POKER_BETA_MAINTENANCE` compose **most-restrictive-wins** in `app/games/poker/access.ts`.

## Detect / Confirm (what to roll back to)
- Match the smallest control to the blast radius: bug in join path → `POKER_BLOCK_NEW_JOINS`; broad instability → `finish_active_hands`; data-exposure/SEV-0 → `full_maintenance` or `POKER_ENABLED=0`.
- Prefer preserving live hands: `finish_active_hands` lets them complete; `full_maintenance`/`emergency_shutdown`/kill switch cut access but still never settle a hand.

## Immediate action (apply the flag)
1. Set the env var in Vercel project `chococfko` (env change; redeploy/propagate per platform). Choose the **least restrictive** tier that contains the problem.
2. Set `POKER_MAINTENANCE_MESSAGE` + `POKER_MAINTENANCE_ETA` so users see why.
3. Double-check spelling of `POKER_MAINTENANCE_MODE` — a typo fails closed to `full_maintenance` (safe but disruptive).

## Verify
- Access reflects the new tier (new create/join blocked as intended; live hands still progress unless you chose a severe tier).
- No coins moved, no hands settled/cancelled by the flag change (invariant).
- Banner text/ETA visible to users.

## Recover (turning it back on)
1. Confirm the underlying incident is resolved and verified.
2. Step the tier **down gradually** (`full_maintenance` → `no_new_joins` → `normal`), watching SLOs at each step, rather than jumping straight to `normal`.
3. Clear `POKER_BLOCK_NEW_JOINS` / restore sub-feature flags last.

## Communicate
- Update the banner as you step down; clear it at `normal`.
- Record every flag change (value + reason + who) in the incident case note.

## Post-incident
- Ensure flags are back to intended defaults. Note the rollback in `poker_incident_cases`; close `RESOLVED` if this was the mitigation for a now-fixed issue.
