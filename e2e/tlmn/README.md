# Tiến Lên Miền Nam — Automated Test Suite

Three layers, increasing in cost/risk. The first two run with **zero** production risk.

## 1. Offline logic (always safe, no network) — RUN THIS FIRST
Pure engine / round state-machine / settlement / bot tests. No DB, no browser.

```bash
npm run qa:tlmn          # = unit (155) + qa-acceptance (18)
npm run test:tlmn:unit   # existing engine/round/bot/ai/sim suite
npm run test:tlmn:qa     # requirement-traceable acceptance suite
```

## 2. Safe browser specs (realtime transport + responsive) — no DB writes, no auth
Ephemeral broadcast-channel guarantees + responsive layout across 4 viewport groups.

```bash
npm i -D @playwright/test && npx playwright install
npm run test:e2e:tlmn                  # --project realtime --project responsive
TLMN_E2E_BASE_URL=https://chococfko.com npm run test:e2e:tlmn   # target a deployment
```

## 3. Live two-player write flow (WRITES TO THE DATABASE — gated)
> ⚠️ This project has a **single production Supabase database**. The app at every URL
> (localhost, staging, chococfko.com) talks to it, so this suite writes real rows
> (room/seats/games/hands + the two test users' settlement/ledger/stat rows). It is
> therefore **disabled by default** and refuses to run unless you opt in explicitly.
> Cleanup deletes only this room's rows and the two test users' rows for this room;
> real users' data is never touched.

```bash
TLMN_E2E_WRITE=1 TLMN_E2E_ALLOW_PROD=1 \
TLMN_E2E_BASE_URL=https://your-app-url \
npm run test:e2e:tlmn:full
```

### Authentication (no Google OAuth)
`auth.setup.ts` provisions two dedicated test users via the Supabase **service role**
(`auth.admin.createUser`, email pre-confirmed) and materialises their sessions into
two isolated `storageState` files by letting `@supabase/ssr` serialise the auth cookies
itself (version-proof). To use your own stable accounts instead, set
`TLMN_E2E_A_EMAIL/PASSWORD` and `TLMN_E2E_B_EMAIL/PASSWORD` (then no service-role writes
are needed). **Secrets are never printed or committed** (`.auth/` is git-ignored).

### Env (auto-loaded from `.env.local`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### Artifacts
Traces, video, screenshots, and the HTML report land in `e2e/tlmn/.artifacts/`
(git-ignored). View: `npm run test:e2e:tlmn:report`.

### Selector tuning
The live flow's UI controls are matched by `SEL` (i18n-aware regex) at the top of
`multiplayer.spec.ts`. The core gameplay components carry few `data-testid`s, so if a
control isn't found on the first run, adjust `SEL` in that one place — the rest of the
spec is selector-agnostic and the server timer/bot-takeover guarantees the match still
completes so the DB-integrity assertions remain reachable.

## Continuous Integration (GitHub Actions)

Two workflows live in `.github/workflows/`:

### `tlmn-safe-ci.yml` — automatic, **zero production writes**
Triggers: pushes to `main` and PRs touching `app/games/tlmn/**`, `lib/games/tlmn/**`,
`e2e/tlmn/**`, `supabase/**`, or `middleware.ts`; plus manual **Run workflow**.
- Job `logic`: `npm run qa:tlmn` (offline engine/rules/settlement/bot tests).
- Job `browser-safe`: realtime transport + responsive. The app under test runs with
  **placeholder** Supabase env (so loading pages can't read/write production); the
  realtime test uses the real **public** anon key only for ephemeral broadcasts.
- Optional secrets (only to enable the realtime test): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Without them the realtime test self-skips (still green).
- Artifacts + a job summary are uploaded with `if: always()`.

### `tlmn-full-e2e.yml` — gated, **writes to the database**
Triggers: **manual dispatch only** (tick the confirm box), plus a nightly cron that is
**disabled** unless repo variable `TLMN_FULL_NIGHTLY_ENABLED == 'true'` (intended for an
isolated staging DB). Schedule: **03:00 Asia/Tokyo (18:00 UTC)** — `cron: '0 18 * * *'`.
Protections: protected Environment `tlmn-full-e2e` (manual approval), concurrency lock,
write-confirm input, required-secret validation, and run-scoped teardown in `if: always()`
that restores the two test users and deletes ONLY this run's data.

Required secrets — GitHub → **Settings → Secrets and variables → Actions → New repository secret**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `TLMN_E2E_BASE_URL` (deployed or staging URL)
- `TLMN_E2E_EMAIL_A`, `TLMN_E2E_PASSWORD_A`, `TLMN_E2E_EMAIL_B`, `TLMN_E2E_PASSWORD_B`
  (optional — if omitted, dedicated users are provisioned/rotated via the service role)

One-time setup:
1. Add the secrets above.
2. **Settings → Environments → New environment** named `tlmn-full-e2e`, then add yourself
   as a **Required reviewer** (forces manual approval before any write run).
3. (Staging only) add repo **variable** `TLMN_FULL_NIGHTLY_ENABLED=true` to enable nightly.

**Current target: PRODUCTION** (the project has a single Supabase DB). The full flow uses
dedicated test accounts in a private room and restores/cleans only its own run's data.
Point `TLMN_E2E_BASE_URL` + the Supabase secrets at an isolated staging project once available.
