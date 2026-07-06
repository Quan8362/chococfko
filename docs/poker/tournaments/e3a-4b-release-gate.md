# Poker Tournament — E3A-4B final regression & internal-alpha release gate

Status: **READY TO PUSH AND DEPLOY TOURNAMENT FOR INTERNAL ALPHA.** Final repository, migration,
security, economy, regression and release-manifest audit of the internal-alpha tournament. Tournament
stays **dark by default** (`POKER_TOURNAMENT_INTERNAL_ALPHA` unset in production). Nothing was pushed,
deployed, or applied to production during this phase. This report is privacy-safe: no keys, cookies,
JWTs, hole cards, deck order, or seeds.

## 1. Commit chain & branch divergence

- Local `main` HEAD = `00d2500`; `origin/main` = `95467f3`. Divergence: **7 ahead, 0 behind**
  (`git rev-list --left-right --count origin/main...HEAD` → `0  7`). Not pushed.
- The 7 ahead commits, coherent and ordered:
  `4c10ae2` (harden base migration) → `d2bc6fc` (E3A-1 flag/gate/plan) → `045d590` (E3A-2 orchestration
  migration) → `9801654` (E3A-3A actions + hand runner) → `a3bd6b6` (E3A-3B routes/UI/i18n) →
  `308b70e` (E3A-3C live table/realtime/seal) → `00d2500` (E3A-4A local E2E validation).
- All five mandated handoff commits (`045d590`, `9801654`, `a3bd6b6`, `308b70e`, `00d2500`) exist and
  HEAD includes `00d2500`.
- Pre-E3A base = `95467f3` (origin/main). Production still runs the earlier dark build.

## 2. Phase-report verification

Read against the actual commit contents (not remembered summaries):
`e3a-4a-e2e-validation.md`, `internal-alpha-plan.md` (E3A-1..E3A-4 plan), plus the canonical specs
(`engine-specification.md`, `state-machine.md`, `table-balancing.md`, `payout-policy.md`,
`cancellation-policy.md`, `operations.md`, `player-rules.md`, `test-plan.md`). Each refers to the same
`POKER_TOURNAMENT_INTERNAL_ALPHA` gate, the same orchestration/realtime objects, and the same
wallet-isolation invariant (TNMT-CHIP-002). The E3A-4A report was authored at `308b70e` and committed
as `00d2500`; coherent.

## 3. Complete diff classification (`95467f3..HEAD`, 40 files, +4952/−93)

All files are tournament-scoped; no unrelated product code is in the release.

- **Hardened base migration:** `migration_poker_tournament.sql` (M) — reused-idempotency-key guards,
  terminal `COMPLETED` guard, WITHDRAWN-entry-cannot-be-paid, entry-state validation, overlay
  accounting in the settle audit. `CREATE OR REPLACE`-style; matches the hardened form already applied
  to prod (27G-E2). Non-destructive.
- **Orchestration migration + rollback:** `migration_poker_tournament_orchestration.sql` (A),
  `..._orchestration_rollback.sql` (A).
- **Realtime/privacy-seal migration + rollback:** `migration_poker_tournament_realtime.sql` (A),
  `..._realtime_rollback.sql` (A).
- **SQL harnesses:** `poker_tournament_tests.sql` (M), `poker_tournament_orchestration_tests.sql` (A),
  `poker_tournament_realtime_tests.sql` (A).
- **State/domain/hand runner:** `tournament/handRunner.ts` (A) + `.test.ts`, `tableView.ts` (A) +
  `.test.ts`, `uiModel.ts` (A) + `.test.ts`, `stateMachine.ts`/`.test.ts` (M),
  `registration.test.ts` (M).
- **Server actions + authorization:** `tournament-actions.ts` (A), `access.ts` (M),
  `flags.ts`/`flags.test.ts` (M).
- **Routes, UI, components:** `tournaments/page.tsx`, `tournaments/create/page.tsx`,
  `tournaments/[tournamentId]/page.tsx`, `.../table/page.tsx`, `.../table/TournamentTable.tsx`,
  `.../table/useTournamentTable.ts`, `_components/CreateTournamentForm.tsx`,
  `_components/TournamentActions.tsx`, `_components/TournamentOperatorPanel.tsx`, `page.tsx` (M).
- **i18n:** `messages/{vi,en,ja,ko,zh}.json` (M).
- **Playwright/integration tests:** `e2e/poker/tournament-realtime.spec.ts` (A),
  `e2e/poker/poker.config.ts` (M).
- **Privacy-safe documentation:** `docs/poker/tournaments/e3a-4a-e2e-validation.md`,
  `internal-alpha-plan.md` (A), and this report.
- **Unrelated user changes:** none in the tracked diff.
- **Generated/sensitive artifacts:** none tracked.

## 4. Migration & rollback audit

- **Base** matches the hardened, prod-applied form; never reapplied in E3B.
- **Orchestration** is strictly additive + idempotent: `ADD COLUMN IF NOT EXISTS` (×2 on
  `poker_tournaments`), `CREATE TABLE IF NOT EXISTS` (`_seats`, `_hands`), `ENABLE RLS`, `REVOKE`
  writes from anon/authenticated, public-read policies, and `SECURITY DEFINER` RPCs granted to
  `service_role` ONLY (`REVOKE ALL … FROM PUBLIC, anon, authenticated`). Every RPC is row-locked,
  idempotency-key-guarded, chip-conserving (`sum(delta)=0`), and audited. **Grep proves ZERO
  `game_wallets`/`coin_ledger` writes.** No destructive op (no `DROP TABLE`/`TRUNCATE`/`DROP COLUMN`
  on existing data).
- **Realtime/seal** is additive + idempotent: seals `poker_tournaments.seed` via
  revoke-table-SELECT-then-grant-explicit-non-seed-columns (correct Postgres column-privilege pattern);
  drops public read of `poker_tournament_hands` + revokes its table SELECT; adds the non-secret
  `poker_tournament_table_state` pointer (RLS, public read, revoked writes, `service_role`-only
  `touch_table`); publishes ONLY the three non-secret tables (`_seats`, `_entries`, `_table_state`) —
  never `poker_tournaments` / `poker_tournament_hands`; sets `REPLICA IDENTITY FULL` on published tables.
- **Rollbacks** remove only their own objects: orchestration rollback drops its 6 RPCs, 2 tables, 2
  columns; realtime rollback detaches the 3 tables, restores default replica identity, drops the
  pointer + touch RPC — and **deliberately preserves the seed seal** (un-sealing would re-open the
  hole-card leak). Base tournament schema, cash tables, TLMN/Caro, wallets and ledger are untouched by
  either rollback.
- **Live verification on `tmntval`** (preserved disposable volume): 9 `poker_tournament_*` tables
  present; realtime publication = exactly `_entries`, `_seats`, `_table_state`;
  `has_column_privilege('anon', … ,'seed','SELECT')` = **f**;
  `has_table_privilege('anon','poker_tournament_hands','SELECT')` = **f**.

## 5. Security & authorization result

Implementation reviewed AND freshly re-validated in SQL:

- **Flag OFF ⇒ nobody** (fail-closed): `pokerTournamentInternalAlphaVisible = pokerVisibleTo && flags.tournamentInternalAlpha` — with the flag off it returns false even for admins.
- **Anonymous / non-allowlisted / suspended denied:** `pokerVisibleTo` returns false for a suspended
  tester and for the public unless the alpha/closedBeta/public gate admits them; `requireParticipant`
  additionally rejects unauthenticated callers (`not_authenticated`).
- **Operator = admin:** `pokerTournamentCanOperate = visible && isAdmin`; `requireOperator` enforces it
  before every create/transition/seat-draw/advance/start/settle.
- **Seat ownership / out-of-turn / stale actionSeq / duplicate:** `submitTournamentAction` verifies the
  caller occupies a seat at the hand's table (`not_seated_here`), that it is that seat's turn
  (`not_your_turn`), that `view.actionSeq === expectedActionSeq` (`stale_action`), and that the hand is
  unsettled; the double-submit guard is exercised in the browser spec.
- **Cross-user / cross-tournament denied:** the hand's `tournament_id` must equal the requested id
  (`hand_not_found`); the viewer only ever reads their OWN seat/table.
- **Private-card redaction / seed & serialized-hand sealing:** `buildTournamentTableView` computes only
  `holeCardsForSeat(viewer)` and sets `cards: isSelf ? myHole : null`; `liveView` exposes only
  board/betting bookkeeping; `legal` is attached only on the viewer's turn. Seed-bearing rows are read
  with the service role and never cross to the client.
- **Service-role boundary + grants:** orchestration + `touch_table` RPCs are `service_role`-only;
  browsers never receive the service key. Re-proved live: **ORCH-009 / ORCH-009b** (authenticated +
  anon denied orchestration RPC), **RT-004** (pointer + touch service-role only), **RT-002 / RT-003 /
  RT-005** (pointer has no secret column; seed + hand rows sealed while lobby + pointer readable; only
  non-secret tables published).
- **Duplicate settlement/refund/payout protection:** idempotency-key txn rows + terminal-state guards
  in the base settle RPC and orchestration apply/eliminate RPCs. **ORCH-004 / ORCH-006** re-proved
  idempotent apply + once-only elimination.

No unresolved authorization or private-state defect. **Security gate: PASS.**

## 6. Privacy result

Realtime publishes only non-secret tables; the seed column and the serialized hand row are unreadable
by anon/authenticated (verified live). The client's sole private datum is the viewer's own two cards.
Opponent hole cards are never derived. **Privacy: PASS.**

## 7. Economy & integrity result

Re-validated in SQL against `tmntval`:

- Registration debits the wallet once; unregister/cancel refunds once (base suite: ALL ASSERTIONS
  PASSED).
- Tournament hands **never** mutate `game_wallets`/`coin_ledger` — **ORCH-010** (wallets & ledger
  untouched; chips conserved 30000) and **RT-006** (full live flow conserves chips + touches
  wallet/ledger ZERO times).
- Stacks + pot conserve; no negative stack (**ORCH-003** conserves + settles; **ORCH-005**
  non-conserving deltas rejected; the apply RPC rejects a would-be-negative seat).
- Elimination occurs once with append-only finishing places (**ORCH-006**).
- Champion stays `ACTIVE` until settlement; payout credits once; a `COMPLETED` tournament cannot
  re-settle (base settle RPC: terminal-`COMPLETED` guard + payout `ON CONFLICT DO NOTHING`).
- Guarantee overlay is explicit: when `guaranteed_prize_pool > collected_fees`, settlement mints the
  difference under reason `poker_tournament_prize` and records `{collected_fees, overlay}` in the
  settle audit — no unexplained ledger reason.
- No Practice/normal-Poker economy crossover (chips are isolated by construction).

No unexplained economy delta. **Economy & integrity gate: PASS.**

## 8. Executed two-context browser coverage (re-run this phase)

`npx playwright test --config e2e/poker/poker.config.ts --project tournament` in the disposable WSL
checkout against `tmntval` (`http://127.0.0.1:54421`), headless Chromium, landscape 1280×720:

- `setup` (provision six synthetic players via service role): **passed (2.5s)**.
- `tournament`: **passed (34.9s)** — `2 passed`, 0 unexpected, 0 flaky (3.2m wall).

Genuinely executed (not merely compiled). Scope: **heads-up (2-player), winner-take-all** — two
independent authenticated `BrowserContext`s at the same table, independent private cards, opponent
cards hidden, action propagation without manual refresh, turn/board/pot/stack/contribution agreement,
mid-hand refresh recovery, Hand 1→Hand 2 transition, duplicate-submit guard, no per-hand wallet/ledger
mutation. **This is NOT 4-player browser coverage.** (Benign disposable-env log noise: `WebServer`
`admin_notifications` table-not-found — that table is not part of the tournament schema; not a
tournament defect.)

## 9. Authoritative SQL / pure-unit multi-player coverage (reported separately from §8)

Validated at the DB + pure-engine layer, NOT through a 4+ player browser session:

- 4+/6-participant seating, deterministic seeded draw, initial table balance — **ORCH-001** (6 seats,
  sum 30000, balanced) + **ORCH-002** (idempotent).
- N>2 elimination order to finishing places — **ORCH-006**.
- Move-seat / table balancing carrying the stack — **ORCH-007**.
- Blind-level advancement (monotonic) — **ORCH-008**.
- Unregister/refund, completion, payout, wallet/ledger reconciliation (chip conservation; payout total
  = prize pool; wallets/ledger untouched) — base suite + **ORCH-003/010**, **RT-006**.
- Idempotent retries — **ORCH-004**, base register/settle idempotency assertions.
- Pure engine unit layer: **80/80** tournament tests (state machine, hand runner, tableView, uiModel,
  payout, prizePool, elimination, blinds, registration, balancing) + **855/855** full poker lib tests.

## 10. Full regression — commands & results

| Check | Command | Result |
|---|---|---|
| Tournament unit / state-machine / hand-runner / tableView / uiModel | `node --test lib/games/poker/tournament/**/*.test.ts` | **80/80 pass**, exit 0 (2.5s) |
| Full poker lib (engine/betting/bot/practice/tournament/observability) | `node --test lib/games/poker/**/*.test.ts` | **855/855 pass**, exit 0 (223s) |
| Base tournament SQL harness | `psql < poker_tournament_tests.sql` (tmntval) | **ALL ASSERTIONS PASSED**, exit 0 |
| Orchestration SQL harness | `psql < poker_tournament_orchestration_tests.sql` | **ORCH-001…010 PASS**, exit 0 |
| Realtime/privacy-seal SQL harness | `psql < poker_tournament_realtime_tests.sql` | **RT-001…006 PASS**, exit 0 |
| Two-context tournament E2E | `playwright … --project tournament` (tmntval) | **2 passed**, 0 flaky, exit 0 |
| TypeScript | `tsc --noEmit --skipLibCheck` | **exit 0** |
| ESLint (changed tournament surface) | `eslint <14 changed tournament files>` | **exit 0** |
| i18n parity | `node scripts/check-i18n-parity.mjs` | **OK — 5739 keys × 5 locales**, exit 0 |
| Production build | `npm run build` | **exit 0** — 134/134 static pages (warnings only) |

**NOT RUN (with reasons):**
- Full-project `npm run lint` — the Windows ESLint worker is known to crash on this workstation (env,
  not code; see memory `tlmn-audit-harden`). Mitigated by linting the full changed tournament surface
  (exit 0) and by the production build's own ESLint pass (warnings only, no errors).
- 4+ player browser session — out of scope by design (see §8/§9); multi-table/elimination/balancing
  are covered authoritatively in SQL + pure unit.
- Public smoke/responsive projects were not re-run this phase (unchanged since E3A-4A: 12 passed, 1
  pre-existing glossary 404 — see §11); no tournament code depends on them.

No pre-existing warning or failure was hidden: build warnings are pre-existing unused-var /
react-hooks/exhaustive-deps lints unrelated to the tournament changes.

## 11. Glossary 404 classification

The public `smoke` › `/games/poker/glossary` sub-resource 404 observed in E3A-4A is:
- **Unrelated to tournament** (a public non-tournament page).
- **Pre-existing before the E3A chain** — `git log 95467f3..HEAD -- '**/glossary*'` is empty; no
  glossary file appears in the 40-file release diff.
- **Non-blocking** for the tournament internal alpha.

Preserved as an unrelated finding; not fixed here (no unrelated product code touched). Worth a separate
look at the glossary page's asset/metadata refs.

## 12. Secret & artifact scan

- Tracked release diff (`git diff 95467f3..HEAD`) scanned for JWTs, `sb_secret_`, service-role keys,
  private keys, passwords, storageState, personal emails: **no secret literals**. The only matches are
  a symbol import (`SERVICE_ROLE_KEY` name from `./_env`) and a `storageState: stateFileFor(key)`
  function reference in the E2E spec — names, not values.
- `.gitignore` covers `.env*.local`, `/.next`, `/node_modules`, `/test-results/`,
  `/playwright-report/`, `/e2e/screenshots/`, and TLMN/Poker E2E auth states + traces/screenshots.
- Untracked local-only files carry no committed risk (see §14).
- Disposable WSL environments (`~/tnmt-val`, `~/tnmt-e2e`) live outside the repo and are never committed.

## 13. SAFE TO PUSH manifest

The 7 commits `4c10ae2..00d2500` plus this report. Contents:

- Product code: `tournament-actions.ts`, `access.ts`, `flags.ts`, tournament routes/components,
  `handRunner.ts`, `tableView.ts`, `uiModel.ts`, `stateMachine.ts`.
- Audited migrations + rollbacks: base (hardening), orchestration (+rollback), realtime/seal (+rollback).
- Tests: `handRunner/tableView/uiModel/stateMachine/registration/flags` unit tests; the three SQL
  harnesses; `e2e/poker/tournament-realtime.spec.ts` + `poker.config.ts`.
- i18n: `messages/{vi,en,ja,ko,zh}.json`.
- Privacy-safe docs: `e3a-4a-e2e-validation.md`, `internal-alpha-plan.md`, `e3a-4b-release-gate.md`.

## 14. MUST NOT PUSH manifest

- `scripts/poker-playtest/` (untracked) — throwaway local readiness/health/allowlist/reset scripts;
  contains **personal tester emails**. Not staged.
- `tsconfig.__playtest_check.json` (untracked) — throwaway local tsconfig. Not staged.
- Any `.env*.local`, browser profiles, auth/`storageState`, traces, videos, card screenshots,
  `test-results/`, `.next`, `node_modules`, and WSL/local Supabase volumes (`tnmt-val`, `tnmt-e2e`).
- No unrelated user changes exist to exclude.

None of the above is staged or committed by this phase.

## 15. Internal flag & cohort plan

- **Flag:** `POKER_TOURNAMENT_INTERNAL_ALPHA` (server-evaluated via `resolvePokerFlags(process.env)`),
  **default OFF (fail-closed)**. Safe production value now: **unset** (equivalently `0`/`false`).
- **Visibility:** `pokerTournamentInternalAlphaVisible` = `pokerVisibleTo` AND flag ON. Anonymous +
  non-allowlisted denied; a Closed-Beta member is admitted only when `POKER_CLOSED_BETA_ENABLED=1`.
- **Operator:** additionally requires `isAdmin` (`ADMIN_EMAILS`) — independent of cohort membership.
- **Cohort:** the internal cohort is `POKER_BETA_COHORT_INTERNAL` (allowlist of tester emails);
  `POKER_BETA_SUSPENDED` locks a tester out at the access layer.
- Public tournament discovery stays OFF (`tournament` flag hard-off), tournament bots OFF
  (`bot` hard-off), Poker push OFF.

## 16. Controlled production sequence (E3B — DO NOT EXECUTE NOW)

1. Push only the approved commits (`4c10ae2..00d2500` + this report).
2. Wait for the dark Vercel deployment with `POKER_TOURNAMENT_INTERNAL_ALPHA` OFF.
3. Smoke-test the existing production site (poker still dark; no tournament route).
4. Apply `migration_poker_tournament_orchestration.sql` to production.
5. Apply `migration_poker_tournament_realtime.sql` to production (this is the seed/hole-card seal —
   MUST land before any live hand).
6. Read-only post-apply verification (tables present; publication = 3 non-secret tables; `anon` has no
   `seed`/`hands` SELECT).
7. Keep public tournament OFF.
8. Enable internal alpha only for the existing internal cohort: `POKER_TOURNAMENT_INTERNAL_ALPHA=1` +
   `POKER_CLOSED_BETA_ENABLED=1` + `POKER_BETA_COHORT_INTERNAL` populated.
9. Redeploy.
10. Internal production smoke tests.
11. Run 27G-F-CC production tournament E2E.

The base `migration_poker_tournament.sql` is already applied (hardened) to prod and is **never**
reapplied.

## 17. Kill switch & rollback

- **Application kill switch:** unset `POKER_TOURNAMENT_INTERNAL_ALPHA` (→ OFF) and redeploy; routes and
  actions deny access instantly on the next request; no data touched.
- **Code rollback:** revert only the approved E3A commits if needed.
- **Database rollback:** run the audited realtime rollback then the orchestration rollback; both
  preserve the base tournament schema and the seed seal. **Do not** auto-roll-back after live
  tournament data exists without an explicit data review.

## 18. Remaining risks & coverage limitations

- Browser coverage is heads-up only; multi-table balancing, N>2 elimination ladder, final-table
  consolidation, multi-level blind progression, unregister/refund, and completion→payout→wallet
  reconciliation are proven at the **SQL + pure-unit** layer, not through a 4+ player browser session.
- Production migration apply + prod E2E (27G-F-CC) are deferred to E3B and not yet exercised against
  the production project.
- WSL loopback cannot reach the disposable DB over TCP on this workstation; validation used
  `docker exec` into `supabase_db_tnmtval` and an in-WSL Playwright run (documented, not a product
  limitation).
- Pre-existing public glossary 404 remains open (unrelated).

## 19. Final local / remote / production state

- Local `main` HEAD after this phase = the new E3A-4B commit on top of `00d2500`; still **not pushed**.
- `origin/main` remains `95467f3`.
- Production runs the earlier dark build; `POKER_TOURNAMENT_INTERNAL_ALPHA` unset; no tournament route.

## 20. Isolation confirmation

`poker-local` (ports 543xx, containers `supabase_*_poker-local`) was never connected to, exec'd into,
reset, or stopped. Production Supabase (`kjfnqbzfhymhfodmgyow`) was never contacted; no production SQL,
flags, cohorts, roles, or data changed. Only the disposable `tmntval` (`127.0.0.1:54421/54422`,
container `supabase_db_tnmtval`) and the disposable WSL checkout were used; every DB/API target was
`127.0.0.1`/container-local with no `*.supabase.co` endpoint.

**Decision: READY TO PUSH AND DEPLOY TOURNAMENT FOR INTERNAL ALPHA.**
