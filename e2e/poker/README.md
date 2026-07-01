# Poker E2E suite

Multi-user, responsive, and coin-integrity end-to-end tests for `/games/poker`.

Unlike the TLMN suite (which can only ever hit the single production DB), this suite is built
to target a **throwaway Supabase preview branch**, so it can provision users and move
(play-money) coins **without ever touching production**.

## Prerequisites

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

A preview branch with all six poker migrations applied, in order:
`poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine → poker_admin_ops`
(the base `game_wallets`/`coin_ledger` schema from `migration_tlmn_run7_economy.sql` must exist
first). See `reports/poker-qa-validation-2026-07-01.md` for the exact bootstrap that was
branch-validated.

## Environment

| Var | Purpose |
|---|---|
| `POKER_E2E_SUPABASE_URL` | Branch API URL. **Setting this marks the target as a branch** and unlocks the write/integration specs. |
| `POKER_E2E_ANON_KEY` | Branch anon key. |
| `POKER_E2E_SERVICE_ROLE_KEY` | Branch service-role key (provisions users, drives engine RPCs). |
| `POKER_E2E_BASE_URL` | App URL (default `http://localhost:3000`). A local URL auto-starts `npm run dev`. |
| `POKER_E2E_ALLOW_PROD=1` | Explicit override to run write specs against the **default (prod)** DB. Avoid. |

The app under test must be configured with the **same** branch env (so its server actions and
realtime hit the branch, not prod).

## Run

```bash
# Safe, no-write specs (need only a running app pointed at a poker-enabled DB):
npx playwright test --config e2e/poker/poker.config.ts --project smoke --project responsive

# Full suite against a branch (provisions players, drives real hands + coin conservation):
POKER_E2E_SUPABASE_URL=https://<ref>.supabase.co \
POKER_E2E_ANON_KEY=<anon> POKER_E2E_SERVICE_ROLE_KEY=<service> \
npx playwright test --config e2e/poker/poker.config.ts
```

## Projects

- **setup** — provisions 6 players (`admin.createUser`, pre-confirmed) + storageState + funded wallets + a `players.json` key→user-id manifest. Runs only when the target is a branch (or prod is explicitly allowed).
- **smoke** — every public poker route renders with no console/runtime errors.
- **responsive** — `/games/poker/preview` across the landscape viewport matrix (small-phone → wider-desktop); asserts no horizontal overflow and captures a screenshot per viewport.
- **coin-conservation** — headless service-role full 3-player hand; asserts the total-coin invariant at every step and zero net delta. The automated twin of `supabase/poker_full_hand_conservation_test.sql`.
- **multiplayer** — live hand through the real UI in **two independent authenticated contexts** (one storageState each); depends on `setup`. Mints a fresh heads-up table via the service role, then both players sit + buy in, refresh-resync, deal, and play a hand — asserting hole-card privacy (no opponent card ever face-up), the double-submit guard, and AUTHORITATIVE stack deltas read from the table's `data-*` attributes.

### Stable table test hooks (`data-testid`)

The live table (`/games/poker/[tableId]`) exposes these for e2e without coupling to styling/copy:
`poker-table` (`data-live` / `data-phase` / `data-turn-seat` / `data-viewer-seat` / `data-hand-no`),
`poker-seat` (`data-seat-index` / `data-occupied` / `data-status` / `data-stack` / `data-current-actor` / `data-winner` / `data-folded`),
`poker-sit-here` (`data-seat-index`), `poker-buyin` + `poker-buyin-amount` + `poker-buyin-confirm`/`-cancel`,
`poker-hero` (`data-seat-index` / `data-stack`) + `poker-hero-cards` (`data-count`) + `poker-hero-stack`,
`poker-deal`, `poker-community` (`data-count`), `poker-pot-total` (`data-amount`), `poker-street` (`data-street`),
and the action bar `poker-action-fold`/`-check`/`-call`/`-allin`/`-raise`, `poker-raise-amount`, `poker-raise-confirm`, `poker-allin-confirm`.
Every asserted amount is authoritative (server-rendered), never client-computed. Face-up cards keep their accessible `aria-label` (`"<rank> of <suit>"`); backs are `"face down card"` — the privacy check relies on that.

## Safety

- No spec writes to production unless `POKER_E2E_ALLOW_PROD=1` is set. The default posture requires a branch URL.
- Test identities are clearly named (`qa.poker.player.*@chococfko.test`) and ephemeral users are deleted in `finally`.
- Secrets are read into memory only; never logged.
