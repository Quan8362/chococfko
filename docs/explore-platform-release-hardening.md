# Explore Platform — Release Hardening (post-Phase 8)

This document tracks the final production-hardening pass for the Explore Platform.
It is the single source of truth for *what was actually verified* versus *what
remains a manual or blocked step*. Nothing here is marked done without evidence.

**Status labels** (used throughout):

- `Implemented` — code/artifact written and committed.
- `Unit test passed` — covered by `npm test` and passing.
- `Live DB verified` — run against the real Supabase project, results recorded.
- `Browser verified` — exercised through Playwright/real browser.
- `Smoke-tested` — confirmed against production/preview by a human.
- `Manual step pending` — requires a human action (add secret, apply migration, run SQL).
- `Blocked` — cannot be done from this environment; reason recorded.

---

## 0. Baseline (recorded 2026-06-22)

| Item | Value / Result |
|---|---|
| Git root | `web/` (repo), remote `origin` = github.com/Quan8362/chococfko |
| Branch | `main` |
| HEAD | `ec65582` — feat(explore): Phase 8 hardening + discovery-controls UI/UX refactor |
| Remote sync | In sync with `origin/main` (0 ahead / 0 behind) |
| Working tree | Only **untracked Japanese-learning** files (`data/japanese/examples-n3-*`, worklist) — explicitly excluded from this work |
| Next.js | 14.2.35 (App Router) |
| Node | v24.15.0 |
| Package manager | npm (package-lock.json) |
| Scripts | `dev build start`, `lint` (=`next lint`), `test` (=`node --test "lib/**/*.test.ts"`) |
| Unit tests | **324 pass / 0 fail** (`npm test`) — recorded baseline |
| Type check | see §27 (run during this pass) |
| Production build | see §31 |
| CI workflows | **none** (`.github/workflows` empty) |
| ESLint config | **none present** (`next lint` would prompt to set up) |
| Playwright | config + `e2e/jp60.spec.ts` exist; `@playwright/test` **not installed** |
| Cron endpoint | `app/api/cron/return-user/route.ts` — guarded by `CRON_SECRET`; **no `vercel.json` schedule** |
| Rate limiting | only `lib/japanese/rateLimit.ts` (in-memory, per-instance) — **no distributed/DB limiter** |
| Analytics | `analytics_events` (user_id, anonymous_visitor_id, session_id, path, locale, metadata, created_at) |

### Release gates after this hardening pass (run locally 2026-06-22)

| Gate | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **344 pass / 0 fail** (was 324; +20 new: rate-limit 13, cron 7) |
| Type check | `npm run typecheck` | **pass** (exit 0) |
| ESLint (full) | `npm run lint` | **0 errors**, 31 warnings (legacy, non-blocking) |
| ESLint (explore) | `npm run lint:explore` | **exit 0** |
| i18n parity | `npm run i18n:check` | **OK — 3707 keys × 5 locales** |
| Production build | `npm run build` | **success** (exit 0); `/map` is route-split (56.6 kB), not on `/` |

### Explore schema objects present in migrations (source of truth for §3)

- **Tables:** `places`, `search_queries`, `place_saves`, `place_lists`, `place_list_items`,
  `place_plans`, `place_plan_stops`, `place_comments`, `place_reports`, `place_visits`,
  `place_ratings`, `place_collections`, `place_events`, `notification_preferences`,
  `search_concepts`, `analytics_events`.
- **Views:** `place_comments_with_author`.
- **Functions:** `set_updated_at()`, `places_nearby(...)`, `touch_search_concepts_updated_at()`.
- **Triggers:** `places_set_updated_at`, `place_lists_set_updated_at`, `place_plans_set_updated_at`,
  `place_collections_set_updated_at`, `place_events_set_updated_at`, `trg_touch_search_concepts`.

---

## Workstream status

| # | Workstream | Status | Evidence |
|---|---|---|---|
| 2 | Baseline + tracking doc | Implemented | this file; `npm test` 324 pass |
| 3 | Schema verification SQL | Implemented; **Live DB verified — Manual step pending** | `supabase/verify_explore_platform_schema.sql` |
| 4 | Live RLS integration tests | Blocked (no test Supabase project / service creds usable here) | harness + instructions documented below |
| 5 | ESLint release gate | Implemented + passing (0 errors) | `.eslintrc.json`, `lint` + `lint:explore` scripts |
| 6–9 | Playwright / a11y / responsive | Authored; **execution Blocked** here (needs `npx playwright install` + a target) | `e2e/explore.spec.ts`, `e2e/a11y.spec.ts`, viewport matrix in `e2e/playwright.config.ts` |
| 20 | CI release gates | Implemented | `.github/workflows/ci.yml` (test/types/lint/i18n/build always; Playwright opt-in via `EXPLORE_BASE_URL` var) |
| 10 | Cron + notification dedup | Implemented + Unit test passed; **secret + migration Manual step pending** | `vercel.json`, `migration_notification_delivery_log.sql`, route, tests |
| 11 | DB-backed rate limiting | Implemented + Unit test passed; **migration Manual step pending** | `migration_rate_limits.sql`, `lib/rateLimitDb.ts`, tests |
| 12 | Analytics retention/session | Designed; documented blocker | §12 below |
| 13 | Performance budgets | Documented; **measurement Blocked** (needs running/deployed app) | §13 below |
| 14 | External link health | Design documented | §14 below |
| 15 | Data-quality workflow | Existing `lib/dataQuality.ts` reviewed | §15 below |
| 16 | Security hardening | Review performed; fixes noted | §16 below |
| 17 | Health endpoint | Implemented | `app/api/health/route.ts` |
| 18 | SEO validation | Reviewed | §18 below |
| 19 | Smoke-test checklist | Implemented | `docs/explore-platform-production-smoke-test.md` |
| 20 | CI workflow | see §20 | `.github/workflows/` |

---

## §3 — Schema verification

`supabase/verify_explore_platform_schema.sql` is a **read-only** script. It checks
existence and shape of every Explore object (tables, columns, views, functions,
triggers, RLS-enabled state, policy counts) and prints a PASS/FAIL row per object.
It performs **no writes** and touches **no production content**.

> **Manual step pending:** run the script in the Supabase SQL Editor (or `psql`)
> against the production project and paste the result table back here. Until then
> this item is `Implemented` only — **not** `Live DB verified`.

## §4 — Live RLS verification — Blocked

A live RLS suite requires a throwaway Supabase project (or local `supabase start`)
with two seeded test users and the service-role key. Neither a local Supabase nor a
non-production service key is available in this environment, and running RLS probes
against the production project with real users is unsafe. The verification SQL (§3)
asserts RLS-enabled + policy presence statically; full per-user allow/deny probing
is documented as the next manual step. Do **not** report RLS as live-verified yet.

## §5 — ESLint gate

- `.eslintrc.json` extends `next/core-web-vitals` + registers `@typescript-eslint`
  (so legacy inline `no-explicit-any` disables resolve) with pragmatic, non-noisy rules.
- Ignores build output, generated files, data artifacts, python `scripts/`, SQL.
- Scripts: `lint` (full), `lint:explore` (lib + Explore/Admin routes).
- **Result:** `npm run lint` → **0 errors**, 31 warnings; `npm run lint:explore` → **exit 0**.
- One real finding fixed: `PlacesExplorer.tsx` had an imperative geolocation handler
  named `useMyLocation` called inside an `onClick`, which tripped `react-hooks/rules-of-hooks`.
  Renamed to `requestMyLocation` (it calls no hooks — the name was misleading).
- Remaining 31 **warnings** (non-blocking, legacy): 18 `@typescript-eslint/no-unused-vars`,
  12 `react-hooks/exhaustive-deps`, 1 `@next/next/no-page-custom-font`. Triaged as
  low-risk; not auto-"fixed" to avoid behavioural changes to unrelated code.

## §10 — Cron & notification dedup

- `vercel.json` schedules `/api/cron/return-user` **daily at `0 0 * * *` (00:00 UTC = 09:00 JST)**.
  NOTE: the Vercel **Hobby** plan only permits **daily** crons (an hourly `0 * * * *`
  schedule is rejected at deploy time). Plan reminders (once per JST day) work fully on
  this cadence. `event_soon` uses a 3h start window, so on a once-daily run it only
  catches events starting ~09:00–12:00 JST — widen the window or upgrade to Pro (hourly)
  if broader event coverage is needed. Dedup is per-JST-day either way.
- `migration_notification_delivery_log.sql` adds an idempotent delivery-log table keyed
  by `(user_id, type, entity_key, window_key)` with a unique constraint, so the same
  reminder window can never be delivered twice even across instances/retries.
- The route now: validates `Bearer ${CRON_SECRET}` (constant-time-ish compare, never
  logs the secret), bounds work, isolates per-recipient failures, dedups via the log,
  and returns an execution summary.
- Pure helpers (window-key derivation, JST date, dedup decision) are unit-tested.

> **Manual steps pending:** (a) add `CRON_SECRET` in Vercel project env; (b) apply
> `migration_notification_delivery_log.sql`.

## §11 — Rate limiting

- `migration_rate_limits.sql` adds `rate_limit_hits` (atomic fixed-window counter,
  keyed by a privacy-preserving subject hash, never raw IP) + an atomic
  `rate_limit_hit(...)` SQL function and a cleanup helper.
- `lib/rateLimitDb.ts` wraps the function with typed limits per action and a localized
  error shape; falls back safely (fail-open with logging) if the DB is unreachable so a
  limiter outage never hard-breaks UX.
- Pure policy logic (limit table, subject keying, decision) is unit-tested.

> **Manual step pending:** apply `migration_rate_limits.sql`.

## §12 — Analytics retention/session — Designed, partially blocked

`analytics_events` already carries `anonymous_visitor_id` + `session_id` + `user_id`
+ `created_at`, which is enough to compute D1/D7 *forward-looking* cohorts and
useful-action session completion **from the deploy date onward** (no historical
backfill — that would be fabrication). A daily-rollup migration + admin-only read is
the intended implementation; it is documented here and deferred rather than emitting
fabricated historical retention. Dashboard should show "data available from <date>".

## §13 — Performance — Blocked (measurement)

Lighthouse / real traces require a running or deployed instance and a controlled
network profile. This environment cannot run the app headless reliably, so numbers
are **not** recorded. Budgets are documented in `explore-platform-production-smoke-test.md`
for a human to fill from a Vercel preview. Static wins already in place are noted there.

## §16 — Security review (summary)

Reviewed: cron auth (secret-gated, no logging), service-role usage (server-only files),
share-token read-only paths, URL validation, CSV/calendar injection in exports,
personalization privacy (no private notes/participant names in "why am I seeing this").
Concrete additive fixes shipped this pass: DB-backed rate limiting on abuse-prone
writes, delivery-log dedup (prevents notification spam), health endpoint leaks nothing.
Any further confirmed high-severity items are listed in the final report.

---

## Deployment record

| Field | Value |
|---|---|
| Commit deployed | `5344206` (on `main`, pushed to origin) |
| Vercel deployment | `dpl_9MS5RViif1RcbhtLTwPazEBQeZJt` — status **Ready**, target production |
| Domain | https://chococfko.com → **200** |
| `/api/health` | **200** `{ status: "healthy", checks: app/db_public_read/core_view all ok }` |
| `/api/cron/return-user` (no secret) | **401** (auth working) |
| Live partial schema check | `db_public_read: ok` (places readable) + `core_view: ok` (place_comments_with_author present) in production |
| `cron_secret_configured` | **false** — add `CRON_SECRET` in Vercel, then redeploy |
| Cron schedule | daily `0 0 * * *` (09:00 JST) — Hobby plan max cadence |

## Manual / blocked actions required to reach PRODUCTION VERIFIED

1. Apply migrations (order in final report): `migration_rate_limits.sql`,
   `migration_notification_delivery_log.sql`.
2. Run `verify_explore_platform_schema.sql`; paste results.
3. Add `CRON_SECRET` to Vercel env.
4. Run an RLS probe suite against a test project.
5. Install Playwright browsers in CI/preview and run the critical suite.
6. Capture Lighthouse mobile+desktop on a preview deployment.
7. Complete `explore-platform-production-smoke-test.md` against production.
