# Privacy-Safe Logging

Poker handles private state (hole cards, decks, seeds) and user PII. **None of it may ever reach a
log line, analytics event, alert, browser console, or public cache.** This is
SECURITY-HOLE-CARDS-001, enforced in depth and covered by tests.

## Never log

- Authentication tokens, JWTs, cookies, `Authorization` headers, service-role keys.
- Passwords, including private-table passwords.
- Complete deck order, deck stubs, RNG seeds, commit hashes.
- Other players’ unrevealed hole cards.
- Full/precise IP addresses.
- Sensitive profile information (email, phone, etc.).

## Safe to log

- Correlation ids: request id, event id, table id, hand id, action id, transaction id.
- State version, action sequence.
- Server region, build version, timestamp.
- Stable **error codes** (`PKR_*`) instead of free-text messages.
- Coarse enums: severity, phase, street, device class, coded reasons.
- Integer coin **amounts/deltas** in integrity evidence (numbers only — no cards).

## Enforcement (defense in depth)

1. **`scrubDetail(detail)`** (`lib/games/poker/admin.ts`) — drops keys matching
   `card|hole|deck|stub|seed|commit_hash|password|secret|token|jwt|authorization|cookie|service_role`
   and replaces card-shaped values (`As`, `Kd`, …) with `[redacted]`.
2. **`redactTelemetryDetail(detail)`** (`lib/games/poker/telemetry.ts`) — runs `scrubDetail`
   **then** strips coarse PII keys (`email|phone|msisdn|ip_address|ipaddr|remote_addr|client_ip|user_agent`).
   Every telemetry record’s `detail` goes through this before it leaves the process.
3. **`assertDetailClean(detail)`** — a loud, test-catchable assertion for code paths that build
   audit/ops payloads by hand.
4. **`assertSnapshotPrivacy`** (`lib/games/poker/realtime.ts`) — keeps hole cards out of public
   realtime snapshots (recipient-aware).
5. **DB layer** — `poker_ops_events`, `poker_admin_audit`, `poker_incident_cases` have RLS with **no
   client policy** (service-role only) and are excluded from the realtime publication; the reveal
   RPC records *that* cards were revealed, never the values.

## `user_id` placement

`user_id` is **not** a correlation field on plaintext log lines. User attribution belongs in the
RLS-protected DB ops/audit rows, not in Vercel log text.

## Tests

- `telemetry.test.ts` asserts cards, secrets, and coarse PII are stripped, and that a serialized
  record contains none of the raw sensitive substrings.
- `coinIntegrity.test.ts` asserts integrity evidence carries no card tokens.
- `admin.test.ts` (existing) covers `scrubDetail` / `assertDetailClean`.

## When adding a new log/alert/metric

1. Route all payload construction through `redactTelemetryDetail` (or `buildTelemetryRecord`).
2. Prefer a stable `PKR_*` code + coded enums over interpolating raw input.
3. Never add a field carrying cards/tokens/PII “just for debugging”.
4. Add/extend a test asserting the new payload is clean.
