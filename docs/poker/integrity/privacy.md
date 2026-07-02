# Poker Integrity — Privacy

The integrity system correlates accounts to surface multi-account abuse. That correlation must not
become invasive tracking. This document is the data-protection contract for the feature; the
enforcing code is `lib/games/poker/integrity/privacy.ts`.

> **Policy gate:** device/network correlation (`AS_SHARED_IDENTIFIER`) is **disabled** unless
> `POKER_INTEGRITY_ID_SALT` is configured. Behavioural signals need no identifiers and always work.

## Data collected

| Data | Form stored | Purpose |
|---|---|---|
| Public action log, board, pot, settlement | already authoritative (`poker_*`) | behavioural signals |
| Seat→user mapping | from service-role hole-cards table (identity **only**, no card values) | attribute value flow |
| Join/leave, disconnects | `poker_seat_events` | session/relationship signals |
| Device fingerprint | **hashed token only** (`device:<hmac>`) | multi-account correlation |
| Network address | **truncated then hashed** (`ip:<hmac>` of `/24` or `/48`) | multi-account correlation |

**Never collected or stored by this system:** hole cards, decks, seeds, raw IPs, raw fingerprints,
user agents, geolocation, e-mail/phone. `redactPii()` strips these defensively from any evidence
payload before it is stored, and the DB `evidence`/`detail` columns are documented as numeric-only.

## Minimization → hashing pipeline

1. **Minimize.** IPv4 → `/24`, IPv6 → `/48`. A whole household/office collapses to **one** network
   token, deliberately weakening the signal to avoid punishing shared connections.
2. **Hash.** `HMAC-SHA256(kind|minimized, salt)`, truncated to 80 bits, namespaced `ip:` / `device:`.
   Keyed hashing defeats rainbow tables; tokens are **not portable across environments** (salt-bound).
3. **Correlate.** Only hashed tokens are compared (`computeIdentityOverlaps`). The raw identifier is
   consumed at the edge and discarded — it never reaches storage, logs, analytics, or the admin UI.

## Purpose limitation

Identity tokens exist solely to corroborate **behavioural** abuse. By policy and by construction a
shared token alone (severity ≤ 0.35, confidence ≤ 0.25) cannot reach an actionable band; it only
raises a score when an independent behavioural signal exists for the same pair. **A shared workplace
or household network is never treated as proof of abuse.**

## Retention (`INTEGRITY_RETENTION`)

| Artefact | Retention |
|---|---|
| Hashed identity tokens | 90 days |
| Risk cases + signal snapshots | 365 days |
| Immutable admin audit | 10 years (accountability; not auto-purged by this feature) |

## Access

- All `poker_risk_*` tables have RLS enabled with **no client policy** and `REVOKE ALL` from
  `anon`/`authenticated`. Only the `service_role` (admin tooling / SECURITY DEFINER RPCs) can read
  or write them. They are **not** in the realtime publication.
- The admin UI is gated by `checkIsAdmin()` (`ADMIN_EMAILS`).
- Detection logic and scores are never exposed to players.

## Deletion & user rights

- A user deletion cascades risk cases/signals/events (`ON DELETE CASCADE` / `SET NULL`), except the
  audit trail, which denormalizes `actor_email` so accountability survives account deletion.
- Rotating `POKER_INTEGRITY_ID_SALT` invalidates all existing identity tokens (they become
  un-matchable) — an effective kill-switch for identifier correlation.

## Policy & review implications (before enabling identifier correlation)

- Update the player-facing privacy policy to disclose that hashed device/network signals may be used
  for fraud prevention in games.
- Confirm a lawful basis (fraud prevention / legitimate interest) and document it.
- Keep identifier correlation **off** (no salt) until the above is in place; ship behavioural signals
  first.
