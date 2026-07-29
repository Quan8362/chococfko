# Tournament System — Test Report (Prompt 13: Playwright E2E & comprehensive testing)

_Last updated: 2026-07-29. Scope: browser-level end-to-end tests for the standalone tournament
system (`/admin/giai-dau/**`, `/giai-dau/**`, `lib/tournaments/**`, `components/tournaments/**`),
plus the full existing quality gate. **Prompt 14 addendum (§10–§13 below) covers the final audit,
regression fixes, and production-gate status.**_

---

## Prompt 14 — Final audit, fixes & production gate (2026-07-29)

### 10. Findings closed / raised in Prompt 14

| ID | Severity | Status | Summary |
|---|---|---|---|
| F2 (Prompt 13) | Low (a11y) | ✅ FIXED | Public detail tablist now handles **Home/End** (not just Arrows) and has a **focus-visible** ring — matches the admin `WorkspaceTabs` WAI-ARIA set. Regression: `ui-structure.test.ts #3`. |
| F3 (Prompt 13) | Low (dev-only) | ✅ FIXED | `ConfirmDialog` focus effect is now keyed on `open` **only**, reading `onCancel`/`pending` through refs, so a fresh `onCancel` identity on a parent re-render can't re-run the effect and steal focus back to the opener (the observed `next dev` + StrictMode artifact). Regression: `ui-structure.test.ts #4`. |
| **P14-XSS** | **High** | ✅ FIXED | **Stored XSS via JSON-LD.** `lib/seo.ts#jsonLdString` did a bare `JSON.stringify` whose output is injected into a `<script type="application/ld+json">` via `dangerouslySetInnerHTML` on the public tournament pages. An admin-authored tournament **name**/**location** containing `</script>…` would break out of the tag and execute. Fixed by re-encoding `< > &` + U+2028/U+2029 as `\uXXXX` (lossless — browsers decode back; structured data unchanged). Shared helper, so the whole site is hardened. Regression: new `lib/seo.test.ts` (4 tests). |
| P14-QO | Low/Med (info-disclosure) | ✅ FIXED (14B) | `tournament_qualification_overrides.reason` (admin free-text) and `.created_by` (an admin `auth.users` UUID) were readable by **anon via direct REST/Realtime** on published tournaments (row public-gated, `SELECT` granted table-wide; RLS is row-level, not column-level). **Fixed in Prompt 14B** with `migration_tournament_public_privacy.sql`: **REVOKE SELECT** on the base table from anon/authenticated + **DROP** the `tqo_public_select` policy, and expose only the public-safe projection through a `SECURITY DEFINER` RPC `tournament_public_qualification_overrides(event_id) → (group_id, resolved_order)` (pinned `search_path`, `REVOKE … FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated, service_role`, with its own `tournament_event_is_public` guard so draft/archived never leak). The public query layer now calls this RPC; the client no longer subscribes to that table over Realtime. `reason`/`created_by` are unreachable via REST, RPC, or Realtime. Regression: `tournament_public_privacy_tests.sql` (12 checks) + updated `tournament_public_read_tests.sql` (P8). |

### 11. Security audit (read-level, Prompt 14) — PASS

- **Admin guard order:** every admin server action runs `checkIsAdmin()` **before** `createAdminClient()`
  (structural tests: `admin/security.test.ts`, `admin/eventSecurity.test.ts`, `admin/*Security.test.ts`).
- **Service-role isolation:** public code (`app/giai-dau/**`, `lib/tournaments/public/**`,
  `components/tournaments/public/**`) never imports `createAdminClient`/service-role
  (`publicSecurity.test.ts`, `ui-structure.test.ts #13`).
- **IDOR / composite FK:** every mutation calls `loadEvent(admin, tournamentId, eventId)` which returns
  `null` when `event.tournament_id !== tournamentId`; DB enforces `(…, event_id)` composite FKs.
- **RPCs:** all 23 mutating RPCs are `SECURITY DEFINER`, pin `search_path = public, pg_temp`, and
  `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role`. Only the 3
  visibility helpers are granted to anon/authenticated.
- **RLS:** public `SELECT` only where tournament status ∈ (`published`,`completed`); `draft`/`archived`
  never leak; **audit log has no public policy** (default deny) and no anon/authenticated grant.
- **XSS:** closed (P14-XSS). No other `dangerouslySetInnerHTML`/`innerHTML`/`eval` in the module.
- **Hygiene:** no `console.*`/`debugger`/`TODO`/`FIXME` in tournament source; no unjustified `any`;
  the only `eslint-disable`/`@ts-*` are the standard Supabase realtime-typing + exhaustive-deps ones.

### 12. Database audit (Prompt 14) — static verification PASS; live re-run deferred

The local Supabase stack (WSL2+Docker) was **down** this session, so the SQL harnesses were not re-run;
they were **9/9 green in Prompt 13** and the migrations are unchanged. Static verification of the
migration set:

- **Order (dependency chain):** `core → group_assignment → scoring → knockout_bracket → group_knockout →
  reset_path`. Schema (11 tables + RLS + audit log + visibility helpers) is entirely in **core**; later
  migrations add only functions/grants (+ realtime publication in `reset_path`). See the runbook.
- **Idempotency:** tables `CREATE TABLE IF NOT EXISTS` (×11); functions `CREATE OR REPLACE` (×26);
  policies preceded by `DROP POLICY IF EXISTS`; indexes `IF NOT EXISTS` (×15); realtime add guarded by a
  `pg_publication_tables` check; no unguarded `ALTER TABLE … ADD`.
- **Rollback:** every migration has a reverse-order `..._rollback.sql` with `IF EXISTS` guards.
- **Harness isolation:** each `tournament_*_tests.sql` runs inside `BEGIN … ROLLBACK` (no residue) and is
  **local-stack only** — never to be run against production.

Re-running the live DB gate (reset → apply in order → re-apply for idempotency → 9 harnesses →
rollback/reapply) is scripted in `TOURNAMENT_MIGRATION_RUNBOOK.md` and can be executed when the local
stack is brought back up.

### 13. Production gate status (Prompt 14)

- **Local gate:** typecheck ✅, unit `2215/2215` ✅, i18n parity `6523×5` ✅, secret scan ✅ (only a
  negative test assertion + gitignored Playwright artifacts), lint/build — see §6.1 refresh below.
- **Git scope:** committed tournament-only; **excluded** pre-existing poker work
  (`e2e/poker/poker.config.ts`, `e2e/poker/tournament-soak.spec.ts`, `scripts/poker-playtest/`,
  `tsconfig.__playtest_check.json`).
- **Production migration:** **NOT applied** — gated on the operator (backup/PITR confirmation + applying
  the SQL via the Supabase SQL Editor per the runbook). This session cannot (and must not) run
  production SQL without confirmed backup + project ref (production safety gate).
- **Production deploy:** **NOT deployed** — must follow the DB migration (deploying tournament code
  against a DB without the tables would error the pages). Vercel is git-linked to `main`; the branch was
  pushed for a **Preview** first.

---

## Prompt 14B — Qualification-metadata privacy fix + live DB gate (2026-07-29)

### 14B.1 Privacy fix (P14-QO closed)
Implemented the fix for the P14-QO info-disclosure (see the findings table above): a new **migration 7**
`migration_tournament_public_privacy.sql` that (a) creates the public-safe projection RPC
`tournament_public_qualification_overrides(uuid) → (group_id, resolved_order)` — `SECURITY DEFINER`,
`search_path=public, pg_temp`, `REVOKE … FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated,
service_role`, with an internal `tournament_event_is_public` guard; (b) **REVOKEs SELECT** on
`tournament_qualification_overrides` from anon/authenticated; (c) **DROPs** the `tqo_public_select`
policy. The public read layer (`lib/tournaments/public/queries.ts`) now calls the RPC, and
`TournamentDetail` no longer subscribes to the override table over Realtime. Result: `reason` and
`created_by` are unreachable by anon/authenticated via REST, RPC **or** Realtime; the public page still
shows the "BTC phân định" marker and the resolved ordering. Admin/service-role are unchanged.

### 14B.2 Live local DB gate — GREEN (Supabase local stack, project `tnmti1r`, host = local Docker)
Ran the full DB gate **on a clean local database** (rollback-all → apply-all), never against production:

| Step | Result |
|---|---|
| Apply canonical order + migration 7 (`ON_ERROR_STOP=1`, one file at a time) | ✅ 7/7 OK |
| Reapply migration 7 (idempotency) | ✅ OK |
| SQL harnesses (10 — the 9 prior + new `tournament_public_privacy_tests`) | ✅ **10/10 PASS** |
| Rollback migration 7 → grants restored → reapply → grants closed → re-test | ✅ PASS |
| Grant snapshot | `privacy_rpc=1, anon_base_sel=f, auth_base_sel=f, anon_rpc=t, svc_rpc=t, pub_policy=0, rpc_secdef=t, search_path=public,pg_temp, tournament_tables=11` |

`tournament_public_privacy_tests.sql` (12 checks) verifies: anon **and** authenticated cannot direct-read
the base table (V1/V2) nor its `reason`/`created_by` columns (V4/V5); the safe RPC returns only
group_id+resolved_order for the **public** event (V6/V7) and nothing for a **draft** event (V8/V2c);
service-role still reads the full row (V9); and the grants/DEFINER/search_path are correct (V10a–e). The
updated `tournament_public_read_tests.sql` P8 now asserts anon's direct read is **denied** and the RPC
returns the ordering. (Note: `core`/`admin` harnesses initially failed against the long-lived local DB
due to **stale audit_log rows** from prior interrupted runs; both pass on the clean-slate apply,
confirming the failures were data contamination, not a regression.)

### 14B.3 Local quality gate refresh (2026-07-29)
`tsc --noEmit --skipLibCheck` ✅ 0 · unit `node --test` ✅ **2219/2219** · `next lint` ✅ 0 errors ·
`next build` ✅ exit 0 · i18n parity ✅ `6523×5` · secret scan ✅ clean (privacy migration/tests +
changed code carry no secrets).

### 14B.4 Browser E2E status
The Playwright tournament suite was **55/55 green in Prompt 13**; the 14B app-code delta is minimal (one
public read swapped to the safe RPC; one Realtime subscription removed) and is covered by tsc + `next
build`. The privacy behaviour itself is validated at the authoritative DB layer (14B.2). Re-running the
full Playwright suite / `next start` HTTP-status + live-KO browser flows against the local stack is a
residual for a session with a **stable** local stack — the WSL2/Docker Postgres container flaps on
idle (`[[wsl-supabase-e2e-stability]]`), which makes a long browser run unreliable here.

### 14B.5 Production gate — STILL GATED (unchanged, operator required)
Privacy migration is **migration 7** in the canonical order. Production still has **zero** tournament
migrations. Production migration + deploy remain gated on the operator per the runbook: confirm the
correct Supabase **project ref** + a **backup/PITR**, apply migrations 1→7 via the SQL Editor, verify
(incl. §4.9 privacy check), confirm the **Vercel Preview** build, then merge `feat/tournament-system` →
`main`. This session did **not** run production SQL, deploy, or confirm the Preview (no Vercel/gh access).

---

## 1. Summary

Prompt 13 added a dedicated Playwright E2E suite under `e2e/tournaments/` that drives the **real app**
against a **local Supabase stack** (never production) and covers admin authorization, tournament CRUD +
lifecycle, the round-robin / knockout / group-knockout admin workspaces, tie resolution, guest public
pages, realtime, responsive layout, accessibility, routing/404s, and a console/network audit.

**One real production-affecting bug was found and fixed** (a client/server module-boundary crash that
made every public tournament detail page throw — see §7). All authored E2E specs pass; the full
pre-existing quality gate (SQL harnesses, unit suite, typecheck, lint, i18n, build) remains green.

| Gate | Result |
|---|---|
| Tournament SQL migration + harness regression (9 harnesses) | ✅ 9/9 PASS (local stack) |
| Tournament Playwright E2E (this prompt) | ✅ 55/55 PASS |
| Critical E2E, repeated ×2 (flake detection) | ✅ see §5 |
| Full lib unit suite (`node --test`) | ✅ see §6 |
| `tsc --noEmit --skipLibCheck` | ✅ see §6 |
| `next lint` | ✅ see §6 |
| `next build` | ✅ see §6 |
| i18n parity (`check-i18n-parity.mjs`) | ✅ 6523 keys × 5 locales |
| Secret scan (new E2E source) | ✅ no key literals; env + auth + artifacts gitignored |

---

## 2. Local environment (verified local, never production)

- **Stack:** local Supabase in WSL2 + Docker (project `tnmt-i1r`), Kong/REST on `http://127.0.0.1:54421`,
  Postgres on `127.0.0.1:54422` — the port called out in the prompt. Reachable from Windows over
  `localhost` port-forwarding (REST `200`, auth `/health` `200`).
- **Migrations applied to the local DB (in dependency order):** `migration_tournament_core`,
  `..._group_assignment`, `..._scoring`, `..._knockout_bracket`, `..._group_knockout`, `..._reset_path`.
  Verified: 11 `tournament*` tables + the tournament RPC surface. Tournament tables are in the
  `supabase_realtime` publication (required for the realtime scenario).
- **Safety gate:** `e2e/tournaments/_env.ts` `assertLocalTarget()` **refuses to run** unless the Supabase
  host is `localhost`/`127.0.0.1` (aborts on any `*.supabase.co` / `chococfko.com` host). There is no
  "allow prod" override. Every seed/cleanup write and the auth setup call it before touching the DB.
- **App under test:** `next dev -p 3100` with env pointing at the local stack + `ADMIN_EMAILS` set to the
  admin test user. Confirmed live: `/giai-dau` `200`, anon `/admin/giai-dau` → `307` redirect to `/`.
- **Production untouched:** production still has **zero** tournament migrations; no SQL, push, or deploy
  was performed.

### WSL stability note
The local Postgres container flaps (unclean restart) when WSL2 idles the distro between commands — the
documented `[[wsl-supabase-e2e-stability]]` issue. Mitigation: a long-lived WSL keepalive process pins
the distro up for the duration of the runs (`RestartCount` held at 0 once pinned). Without it, runs fail
with `ERR_CONNECTION_REFUSED` / "database system is starting up".

---

## 3. Test identity & data isolation

- **Users** (created in local auth via the service role, idempotent, password rotated per run):
  - `tourn.admin@chococfko.test` — admin (∈ `ADMIN_EMAILS`; recognized by the existing `checkIsAdmin`).
  - `tourn.user@chococfko.test` — plain signed-in user (non-admin).
  - Guest tests run **anonymous** (no storageState).
- **Auth**: `auth.setup.ts` signs in via `@supabase/ssr` and serialises the session cookies into
  Playwright storageState files under `e2e/tournaments/.auth/` (gitignored). Specs apply admin/user state
  per-describe with `test.use({ storageState })`.
- **Isolation**: every row a run creates is tagged with a per-run prefix `E2E-<runId>`; `cleanupRun()`
  (in `afterAll`, best-effort even on failure) deletes only `tournaments` named with that prefix — the
  FK graph cascades to events/competitors/groups/matches/games/podium/overrides. Re-runnable with no
  duplication and no risk to non-test data. The service-role seeder is **Node/test-context only** and is
  never imported into a browser bundle.

---

## 4. E2E files created

```
e2e/tournaments/
  _env.ts                 env loader + HARD local-only safety gate + run-id/paths
  messages.ts             resolve UI strings from messages/vi.json by KEY (no hardcoded literals)
  helpers.ts              console/network guard (§17): no uncaught/hydration errors, no prod host,
                          no service-role leak, no audit-log read, only-local-supabase, 401/403/5xx
  seed.ts                 service-role seeder + cleanup (tournaments/events/competitors/groups/
                          matches/games/podium/overrides; composite round-robin fixtures)
  auth.setup.ts           provision admin + user, capture storageState
  tournaments.config.ts   Playwright config: per-scenario projects + local-stack webServer
  authorization.spec.ts   Scenario A §7.1–7.3
  crud.spec.ts            Scenario A §7.4–7.10
  round-robin.spec.ts     Scenario B §8
  tie.spec.ts             Scenario C §9 (presentation half)
  knockout.spec.ts        Scenario D §10 (admin workspace + public surface)
  group-knockout.spec.ts  Scenario E §11 (admin workspace)
  realtime.spec.ts        Scenario G §13
  public.spec.ts          Guest public pages (§8.9)
  routes.spec.ts          §16 routes & error handling
  console-network.spec.ts §17 console/network audit
  a11y.spec.ts            §15 accessibility
  responsive.spec.ts      §14 responsive matrix (+ screenshots)
```

Also: `.gitignore` updated to exclude `e2e/tournaments/.auth/`, `.artifacts/`, `.env.stack.local`.

---

## 5. Scenario results (55 tests, all PASS)

| Project | Tests | Scenario | Notes |
|---|---:|---|---|
| setup | 1 | provision admin+user | storageState created |
| authorization | 3 | A §7.1–7.3 | anon → redirect; non-admin → redirect; admin reaches list + create form |
| crud | 6 | A §7.4–7.10 | create draft, name/date validation, edit, **stale-version conflict (no overwrite)**, publish-gate→publish, delete-empty-draft, archive |
| round-robin | 1 | B §8 | assignment fallback control present; **preview = exactly 6 matches**; generate builds schedule; standings list all four |
| tie | 2 | C §9 | guest sees **"BTC phân định"** label but **not** the internal reason; admin tie/resolution tab present |
| knockout | 2 | D §10 | admin seeding workspace loads + lists 6 competitors (bracket size 8 / 2 BYE); public bracket tab degrades to empty state |
| group-knockout | 1 | E §11 | 16-competitor / 4-group workspace loads with competitor+group tabs; championship+consolation qualifier settings shown |
| realtime | 2 | G §13 | guest reaches **connected**; admin change propagates to the guest **without reload**; two guests both update |
| public | 3 | guest §8.9 | reads overview/schedule/standings; **no admin actions**; deep-link to standings tab |
| routes | 8 | §16 | list; published detail; draft/archived/missing → not-found; reload preserves event+tab; empty-state; invalid `?event` fallback |
| console-network | 3 | §17 | clean + only-local-supabase + no audit-log read; no unexpected 401/403; no request storm |
| a11y | 5 | §15 | one H1 + labelled tablist; public Arrow keys; connection `role=status` + qualification text; admin tablist Arrow+Home/End; confirm dialog modal + Escape→restore |
| responsive | 18 | §14 | 6 viewports × {public list, public standings, admin list}; no body overflow; wide table scrolls in-container; screenshots captured |

**Flake control (§18):** the critical subset (authorization, crud, public, routes, console-network,
round-robin, tie, knockout, group-knockout, realtime) was run **twice** back-to-back — _[filled in §5.1]_.

### 5.1 Critical-twice result
Critical subset (setup + authorization + crud + public + routes + console-network + round-robin + tie +
knockout + group-knockout + realtime = 32 tests) run back-to-back:
- Pass 1: **32 passed** (4.8m)
- Pass 2: **32 passed** (6.1m)
- **0 flaky** — no test failed or was retried across the two runs. No `waitForTimeout` sleeps are used
  as synchronization; specs wait on concrete UI/network state. Realtime tests use finite (25s) timeouts
  with clear failure messages.

### Viewports exercised (§14)
Desktop 1440×900, Laptop 1280×800, Tablet 1024×768, Tablet-portrait 768×1024, Mobile 390×844,
Mobile-landscape 932×430 (iPhone-16-Pro-Max-class). Screenshots written to
`e2e/tournaments/.artifacts/screenshots/` (gitignored) as evidence — `public-list-*`,
`public-standings-*`, `admin-list-*` per viewport.

### Realtime & downstream-reset results
- **Realtime (G):** PASS — the guest connection indicator reaches `connected`, and an admin-side change
  is delivered over the subscribed channel and refetched into the guest view with no manual reload;
  verified across two independent guest contexts. (Score edits travel the same channel — the subscribed
  tables include `tournament_match_games`, `tournament_matches`, `tournament_podium`,
  `tournament_qualification_overrides`.)
- **Downstream correction / reset (F §12):** the reset RPC transaction, dependency-path isolation
  (only the affected branch resets), the `RESET`-token confirmation guard, and event
  `completed → running` transition are **exhaustively covered by the SQL harness
  `tournament_reset_path_tests.sql` (PASS)** and the domain unit tests (`knockout-impact`,
  `progression`). A UI-driven E2E for the reset flow requires seeding a fully-completed multi-round
  bracket and is deferred — see §8 (Prompt-14 residuals).

---

## 6. Full quality gate

| Check | Command | Result |
|---|---|---|
| Tournament SQL harnesses (9) | `psql < tournament_*_tests.sql` on local DB | ✅ 9/9 PASS |
| Full lib unit suite | `npm test` (`node --test lib/**/*.test.ts`) | ✅ **2215 pass / 0 fail / 0 skip** |
| Typecheck | `tsc --noEmit --skipLibCheck` | ✅ clean |
| Lint | `next lint` | ✅ no errors (only pre-existing warnings in unrelated game code) |
| Build | `next build` | ✅ success — 137/137 static pages generated |
| i18n parity | `node scripts/check-i18n-parity.mjs` | ✅ 6523 keys × 5 locales |
| Secret scan | grep new E2E source | ✅ no key literals; local test password is env-overridable; `.env.stack.local`/`.auth`/`.artifacts` gitignored |

**SQL harnesses (all PASS on the local stack):** `tournament_core_tests`, `tournament_admin_tests`,
`tournament_events_tests`, `tournament_group_assignment_tests`, `tournament_scoring_tests`,
`tournament_knockout_bracket_tests`, `tournament_group_knockout_tests`, `tournament_public_read_tests`,
`tournament_reset_path_tests`.

### 6.1 Detailed gate output
- **Unit suite** (`npm test`): `tests 2215 · pass 2215 · fail 0 · skipped 0 · todo 0` (~282s). Includes the
  tournament domain + admin/public security unit tests.
- **Typecheck** (`tsc --noEmit --skipLibCheck`): clean (0 errors), including all new `e2e/tournaments/**`
  TypeScript and the `tabFromSlug` extraction.
- **Lint** (`next lint`): 0 errors. Pre-existing warnings only (unused vars / exhaustive-deps in
  `lib/games/**` and other unrelated modules) — none introduced by Prompt 13.
- **Build** (`next build`): succeeds; `✓ Generating static pages (137/137)`; the tournament routes
  (`/giai-dau`, `/giai-dau/[slug]`, `/admin/giai-dau/**`) compile and render.
- **SQL harnesses**: run via `docker exec … psql < supabase/tournament_*_tests.sql` on the local DB;
  each prints its own `ALL … ASSERTIONS PASSED` notice inside a `BEGIN … ROLLBACK` (no residue).

---

## 7. Findings

### F1 — (FIXED) Public tournament detail page crashed: `tabFromSlug` across the client boundary
`tabFromSlug`/`TAB_SLUGS` were exported from `components/tournaments/public/TournamentDetail.tsx`, a
`'use client'` module, and imported+called in the **server** route `app/giai-dau/[slug]/page.tsx`. A
plain function exported from a Client Component becomes a non-callable client reference when imported
into a Server Component, so **every published tournament detail render threw**
`TypeError: tabFromSlug is not a function` and fell through to the error boundary (rendered as HTTP 200
under `force-dynamic`, so it was invisible to status-only checks and to the SQL/unit gates). This is a
production-affecting defect the first browser E2E run caught.
**Fix:** extracted `TAB_SLUGS` + `tabFromSlug` into a plain module `lib/tournaments/public/tabs.ts`;
both the server route and the client component import from there. Public detail now renders. _(This is
the only app-code change in Prompt 13 besides the test hooks; it is a bug fix, not a new feature.)_

### F2 — (minor) Public detail tablist implements Arrow keys but not Home/End
`TournamentDetail`'s public tablist supports `ArrowLeft/Right` but ignores `Home`/`End`, whereas the
admin `WorkspaceTabs` implements the full WAI-ARIA set (Arrow + Home/End). Home/End are recommended-but-
optional in the tabs pattern. Left as-is (behavioural, not a crash); noted for a future polish pass. The
a11y spec asserts Arrow on the public tablist and Arrow+Home/End on the admin tablist accordingly.

### F3 — (env/dev-only) Confirm dialog initial focus under `next dev` + React StrictMode
`ConfirmDialog` sets initial focus on its confirm button (`confirmRef`), but its focus effect depends on
an unstable `onCancel` and its cleanup re-focuses the opener; under `next dev` StrictMode double-invokes
effects, so the observed post-open focus can land back on the opener. This is a dev-mode artifact (a
production build invokes the effect once). The a11y spec asserts the reliable modal contract
(`aria-modal`, labelled title, keyboard-reachable confirm, Escape→restore-focus). Recommend stabilising
`onCancel` (e.g. `useCallback`) if strict focus-on-open is desired; low priority.

### F4 — (env-only, benign) `analytics_events` 404 on the local stack
Public pages fire a telemetry insert to `public.analytics_events`, a table that exists in production but
is **not** part of the tournament migrations, so it returns 404 on this local stack. Unrelated to
tournaments; treated as benign console noise by the network guard (the guard still fails on any 401/403
on REST/API or any 5xx). No action needed for tournaments.

### F5 — (informational) `notFound()` returns HTTP 200 under `force-dynamic` in dev
With `export const dynamic = 'force-dynamic'`, `next dev` serves `notFound()` as HTTP **200** while
rendering the not-found UI; a production build returns **404**. The route tests therefore assert on the
not-found **content** (stable across dev/prod) and tolerate the dev 200. Draft/archived/missing slugs
all correctly resolve to the not-found view (never leaking that a draft exists).

---

## 8. Residual / deferred for Prompt 14

These are covered at the SQL-RPC + domain-unit level (all green) but not yet driven step-by-step through
the browser UI; they need richer multi-step seeded state and are the natural next E2E increment:

1. **Round-robin full result entry via UI** (§8.5–8.7): entering every match score through
   `MatchResultsPanel`/`ScoreEditor` and asserting live standings/points/diff. _Currently: assignment
   (fallback) + preview(6) + generate + standings-render are UI-driven; result correctness is covered by
   the completed fixture in `public.spec.ts` + `tournament_scoring_tests.sql`._
2. **Knockout bracket progression via UI** (§10.5–10.10): BYE auto-advance, winner slotting, third-place,
   podium, through `KnockoutResultsPanel`. _Covered by `tournament_knockout_bracket_tests.sql` + domain._
3. **Group+knockout dual-branch progression + isolation via UI** (§11.4–11.10) and consolation=0.
   _Covered by `tournament_group_knockout_tests.sql` + domain._
4. **Downstream reset via UI** (§12): impact preview list + `RESET`-token confirmation + recompute.
   _Covered by `tournament_reset_path_tests.sql`._
5. **Realtime edge cases (§13):** channel cleanup on event switch, disconnect status + polling fallback +
   stop-on-reconnect, and the admin-to-admin stale-data banner (`AdminRealtimeBanner`). _Live-propagation
   and connected-status are covered; the disconnect/reconnect transitions need network-fault injection._
6. **Tie blocking-detection UI (§9.1–9.5):** the resolve dialog + permutation-only payload guard.
   _Covered by `tournament_scoring_tests.sql` + `tie-resolution.test.ts`; the presentation half (label,
   no metadata leak) is UI-driven._
7. **Production 404 verification:** run the route/404 specs against a `next build && next start` server to
   assert HTTP 404 status codes directly (see F5).

None of these block Prompt 13; they are the scoped next slice of browser coverage.

---

## 9. How to run

```bash
# From web/ (local Supabase stack must be up; keys in the gitignored e2e/tournaments/.env.stack.local,
# regenerate with `supabase status -o env`):
npx playwright test --config e2e/tournaments/tournaments.config.ts                 # all
npx playwright test --config e2e/tournaments/tournaments.config.ts --project crud  # one scenario
```
The config's `webServer` starts `next dev -p 3100` wired to the local stack when one is not already
running (`reuseExistingServer` in local). The suite refuses to run against any non-local Supabase host.
