# Poker load-test tooling

Controlled load-testing + scalability tooling for Chợ Cóc FKO Poker. **Never point this at
production.** Everything here is gated to a throwaway Supabase preview branch by default.

See the full plan and results in [`docs/poker/performance/`](../../docs/poker/performance/).

## Components

| File | What it does | Needs a DB? | Runs today |
|---|---|---|---|
| `engine-bench.ts` | CPU microbenchmark of the authoritative engine (deal / betting / showdown) | No | ✅ `npm run poker:load:bench` |
| `config.ts` | Load profiles, cost guardrails, never-prod safety gate, stop switch | No | (library) |
| `config.test.ts` | Unit tests for the guardrail spine | No | ✅ `npm run test:poker:load` |
| `preflight.ts` | Validate a profile + target safety, print the budget — no writes | No | ✅ `npm run poker:load:preflight` |
| `readload.ts` | Realtime-channel + authenticated READ RPS driver (the real ceiling) | Branch | ⚠️ branch only |
| `e2e/poker/multiplayer.spec.ts` | GAMEPLAY WRITE path (join → legal actions → settlement) via real server actions | Branch | ⚠️ branch only |

The write/gameplay path deliberately goes through the **Playwright** harness so every command
travels its real, validated Next server-action route (no direct mutation of authoritative state).
`readload.ts` covers the realtime + read-scale dimension that Playwright can't cheaply fan out to
hundreds of clients.

## Safety model

A driver refuses to run unless **one** of these is true (see `assertSafeTarget`):

- `POKER_LOAD_SUPABASE_URL` points at a throwaway branch (recommended), **or**
- `POKER_LOAD_ALLOW_PROD=1` is set explicitly (never do this for a real load run).

Cost/scale ceilings (`assertWithinGuardrails`, override with `POKER_LOAD_MAX_*`):

| Ceiling | Default |
|---|---|
| `POKER_LOAD_MAX_TABLES` | 120 |
| `POKER_LOAD_MAX_PLAYERS` | 720 |
| `POKER_LOAD_MAX_CLIENTS` | 1500 |
| `POKER_LOAD_MAX_DURATION_SEC` | 1800 |
| `POKER_LOAD_MAX_RPS` | 400 |

**Stop switch:** `touch scripts/poker-load/.STOP` (or Ctrl-C) makes every driver wind down after
in-flight work. `.STOP` is git-ignored.

## Profiles

`baseline` · `moderate` · `target` · `burst` · `settlement` · `reconnect` · `lobby` · `history`
(defined in `config.ts`). Select with `POKER_LOAD_PROFILE=<name>`.

## Quick start

```bash
# 1) CPU baseline (no infra):
npm run poker:load:bench

# 2) Dry-run the plan for the target profile (no infra):
POKER_LOAD_PROFILE=target npm run poker:load:preflight

# 3) Provision a throwaway branch + seed open tables via the Playwright harness:
POKER_E2E_SUPABASE_URL=https://<ref>.supabase.co \
POKER_E2E_ANON_KEY=<branch anon> POKER_E2E_SERVICE_ROLE_KEY=<branch service> \
npm run test:e2e:poker:full

# 4) Realtime/read load against the seeded branch:
POKER_LOAD_SUPABASE_URL=https://<ref>.supabase.co \
POKER_LOAD_ANON_KEY=<branch anon> \
POKER_LOAD_PROFILE=baseline npm run poker:load:read
```

## Cost guardrails

Realtime + Postgres load on a preview branch is metered. Start at `baseline`, watch the Supabase
dashboard (Realtime concurrent connections, DB CPU, egress), and only step up profiles once each
level is green against the budgets in `docs/poker/performance/results.md`. Delete the branch when
done (`supabase branches delete`).
