# Tournament Rule Engine — Design (Prompt 15A-1)

> **Scope of this phase:** pure TypeScript domain + unit tests only. **No** database migration, **no**
> server action, **no** admin/public UI, **no** integration into production scoring, **no** commit /
> push / deploy / SQL. This document records the design so Prompt 15A-2 (database) and 15B/15C
> (UI/integration) can build on a stable contract.

Branch: `feat/tournament-rules-fjp-2026` (from `feat/tournament-system`, base contains privacy fix
`336e068`). Files live under `lib/tournaments/rules/**`.

---

## 1. Why a rule engine — engine vs. rule configuration

The existing tournament **engine** (`lib/tournaments/domain/**`) computes standings, brackets,
progression and podium. Its scoring helper `deriveMatchOutcome` is deliberately fixed: a match is won
by the side that wins more games; a game is won by the higher score. That is correct for the generic
system but cannot express *per-competition* rules such as "group games are touch-15 for Beginner but
touch-21 for everyone else", "knockout is touch-21, win by 2, capped at 31", or "a mixed pair gets a
point head-start".

So we add a **rule configuration** layer **beside** the engine, not inside it:

- **Tournament engine (unchanged):** standings, brackets, progression, podium. `deriveMatchOutcome`
  is untouched — nothing in this phase changes its behavior.
- **Rule configuration:** pure data describing *how a game/match is scored* for one event.
- **Rule preset:** a versioned template of rule configuration (e.g. FJP Olympiad 2026).
- **Event rule snapshot:** an immutable, self-contained copy of rules attached to one event.
- **Score evaluation by rules:** pure functions that judge a game/match **against a snapshot**.

**Hard architectural rule:** neither the engine nor anything consuming a snapshot may branch on a
tournament name, an event name, a year, or a category string. There is no
`if (tournamentName === 'FJP OLYMPIAD 2026')` anywhere. Every decision is driven by the snapshot that
is passed in. (A meta unit test scans the engine source, with comments stripped, to enforce this.)

---

## 2. Preset and snapshot

A **preset** is a *template only* — it is never the global default. Applying a preset **deep-copies**
its rules into a fresh **snapshot** and records provenance:

- `preset_key`, `preset_version` — which template this came from,
- `source: 'preset' | 'custom'`,
- `snapshot_version` — bumped on every override,
- `requires_configuration` — true while some part still needs organizer input.

Guarantees (all unit-tested):

- Editing a preset **later** cannot change an existing snapshot (no shared mutable reference — deep
  clone via JSON round-trip, then recursive `Object.freeze`).
- Overriding a snapshot cannot mutate the preset or the original snapshot; it returns a **new**
  snapshot with `snapshot_version + 1` and preserved provenance.
- Serialization is **deterministic** (`serializeRuleSnapshot` — canonical JSON, keys sorted
  recursively, arrays keep order because order is meaningful, e.g. `tie_break_order`). Equal snapshots
  always serialize byte-identically.
- An event can be fully **custom** (`source: 'custom'`, `preset_key: null`) with no preset dependency.

### Why old tournaments never change

Existing tournaments carry no snapshot and continue to use the fixed `deriveMatchOutcome` path.
Because a snapshot is a deep, frozen copy taken at apply-time, and presets are rebuilt fresh on each
lookup (the registry hands out a new object every call), there is no live link from a preset back to
any event. Changing or adding a preset therefore has **zero** effect on already-configured events.

---

## 3. Domain contracts (pure functions)

| Function | Purpose |
|---|---|
| `getRulePreset(key, version)` | Registry lookup → `RulePreset \| null` (fresh object each call). |
| `applyRulePreset({ preset, category })` | Deep-copy a preset variant → `EventRuleSnapshot`. Throws `UNKNOWN_CATEGORY`. |
| `createEventRuleSnapshot({...})` | Build a snapshot from any rule set (preset or custom). |
| `overrideSnapshotRules(snapshot, patch)` | New snapshot with a deep-partial patch applied; version bumped. |
| `serializeRuleSnapshot(snapshot)` | Deterministic canonical JSON. |
| `validateTournamentRules(rules)` | Validate a rule set → typed issues by field path. |
| `validateEventRuleSnapshot(snapshot)` | Rules + metadata + category-vs-preset provenance. |
| `validateGameScoreByRules(rules, {scoreA,scoreB})` | Judge one game → `{ok, winner\|null, tied}`. |
| `validateMatchScoresByRules(rules, games[])` | Judge a match; enforces `games_to_win`/`max_games`. |
| `deriveGameWinnerByRules(rules, score)` | Winner side (or `null` tie); throws `INVALID_GAME_SCORE`. |
| `calculateStartingScore({handicap, competitorA, competitorB})` | Handicap → starting scores or typed error. |
| `compareByTieBreakToken(token, a, b)` | Compare by one tie-break token, or typed "unsupported (manual)". |

All are pure, deterministic, do not mutate input, use `no any`, and return **typed** errors — either a
thrown `RuleEngineError` (with a stable `code`) for programmer/data faults, or a discriminated result
union / `RuleValidationIssue[]` (with field `path`) for expected invalid input.

### Rule types (fields)

- **MatchRules:** `games_to_win`, `max_games`, `points_to_win`, `win_by`, `points_cap` (`number|null`),
  `allow_tied_game`.
- **GroupStageRules:** `match` + `win_table_points`, `loss_table_points`, `tie_break_order`.
- **KnockoutRules:** `match` only. **The third-place model is owned by the domain engine and is
  intentionally not configurable here.**
- **HandicapRules:** `enabled`, `mode` (`starting_score | point_adjustment`), `entries[]`,
  `requires_configuration`.
- **Snapshot metadata:** `preset_key`, `preset_version`, `source`, `snapshot_version`,
  `requires_configuration`.

### Game legality (validateGameScoreByRules)

A decided game is legal when the winner reached `points_to_win`, the margin ≥ `win_by`, and the
winning score ≤ `points_cap`. Deuce handling: above `points_to_win` but below the cap, the game must
end **exactly** on the `win_by` margin (e.g. at to-21/by-2, `22-20` and `23-21` are legal but `24-21`
is `INVALID_OVERSHOOT`). At the cap a smaller margin is legal (`31-30`). Ties are legal only when
`allow_tied_game` is true.

### Tie-break tokens

Supported tokens: `table_points`, `point_difference`, `points_for`, `head_to_head`,
`organizer_decision`, `random_draw`. Identity criteria (alphabet / seed / row id) are **not** in the
union, so they can never be configured as a sporting criterion. The engine can auto-evaluate only
`table_points`, `point_difference`, `points_for`; the others are legal to configure but resolve to a
**typed `{ supported: false, token }`** result — never silently ignored. Validation rejects empty
orders, duplicates, and unknown tokens.

The generic default order remains `table_points → point_difference → points_for →
organizer_decision`.

---

## 4. FJP Olympiad 2026 preset

- `key: 'fjp_olympiad_2026'`, `version: 1`, `isDefault: false` (template only, never the default).
- Category enum (never an arbitrary string): **`beginner`**, **`standard`**. Beginner is identified by
  the event's *category*, **never by name**.

**Confirmed values (from the design doc's outstanding-work notes and this prompt):**

| Area | Beginner | Standard |
|---|---|---|
| Group game | single set, touch **15**, win_by 1 | single set, touch **21**, win_by 1 |
| Knockout game | touch **21**, win by **2**, cap **31** | touch **21**, win by **2**, cap **31** |
| Standings | win **1** / loss **0** | win **1** / loss **0** |
| Tie-break | `table_points → point_difference → points_for → organizer_decision` | same |

`random_draw` may replace `organizer_decision` per event via a snapshot override.

---

## 5. Handicap — OFFICIAL (Prompt 15D-1B)

> **Source:** the ĐIỀU LỆ FJP OLYMPIAD 2026 handicap rule (chấp điểm) is now integrated. The pair with
> **more women** starts each game/set ahead by **2 points per surplus woman**. Concretely:
> Nam+Nam vs Nữ+Nữ → Nữ+Nữ chấp 4; Nam+Nam vs Nam+Nữ → Nam+Nữ chấp 2; Nam+Nữ vs Nữ+Nữ → Nữ+Nữ chấp 2;
> equal women → 0–0. **Never** keyed off a pair/category name — only composition.
>
> **Formula:** `difference = femaleCountA − femaleCountB`. `difference > 0` ⇒ A opens on `difference·2`;
> `difference < 0` ⇒ B opens on `|difference|·2`; `= 0` ⇒ 0–0.

### 5.1 Preset versions

- **`fjp_olympiad_2026` v1** — retained (deprecated) for provenance. Handicap `enabled` but
  `requires_configuration: true`, `mode: 'starting_score'`, no entries. **Still blocks** scoring with
  `HANDICAP_NOT_CONFIGURED`. A v1 snapshot is **never** silently upgraded to v2.
- **`fjp_olympiad_2026` v2** — official. Handicap `enabled`, `mode: 'female_count_difference'`,
  `points_per_difference: 2`, `requires_configuration: false`. Same sporting rules (group 15/21,
  knockout 21/win-by-2/cap-31). The admin picker offers **v2 by default** (v1 is `status='deprecated'`).

### 5.2 Starting / final score semantics

The handicap is each side's **opening** score for **every** game/set. The score entered/stored is the
**final scoreboard** score (already including the head start). The server:

1. computes the starting score authoritatively from the two compositions (never from the client),
2. blocks a final score **below** its starting score (`score_below_starting_score`; DB CHECK
   `tmg_scores_ge_starting` backstops it),
3. applies target/win-by/cap to the **final** scoreboard, and derives the winner server-side,
4. persists the starting score + `handicap_mode`/`handicap_version` per game (migration #10) and in the
   score audit — so a later preset edit can **never** re-interpret an old result.

`calculateStartingScore` output (`§9`): `startingScoreA/B`, `adjustmentA/B`, `femaleCountA/B`,
`difference`, `mode`, `reason` (`disabled | entry_match | female_count_difference`). A missing
composition → `HANDICAP_COMPOSITION_REQUIRED`; an invalid one → `HANDICAP_COMPOSITION_INVALID`
(mapped at the runtime to `competitor_composition_required` / `competitor_composition_invalid`).

### 5.3 The entry-matched modes (still available)

The FJP handicap ("chấp điểm") depends on competitor **composition** (kind + male/female counts),
never identity. The schema, validation, and a fail-closed evaluator are shipped:

- `HandicapRuleEntry` keys an exact composition class (`kind`, `maleCount`, `femaleCount`) → `value`.
- `compositionKey()` gives a stable class key (e.g. `pair:m1:f1`).
- `calculateStartingScore`: disabled → `0/0`; **enabled but pending → typed
  `HANDICAP_NOT_CONFIGURED`**; configured but no matching entry → `HANDICAP_NO_ENTRY`; negative result
  → `NEGATIVE_STARTING_SCORE`.

**Blocker / needs organizer (BTC) confirmation:** the concrete handicap **numbers** for FJP 2026 are
**not** in the repository or docs and were **not invented**. The FJP preset therefore ships handicap
as `enabled: true, requires_configuration: true, entries: []`, which:

- validates structurally (a pending handicap is allowed to be empty — it is not-yet-ready, not
  malformed), and
- **fails closed** if anything tries to apply it to a live score.

`requires_configuration` propagates to the snapshot metadata so a downstream UI can surface "rules
incomplete" before scoring.

---

## 6. Competitor composition

`CompetitorComposition` = `{ kind: 'single'|'pair'|'team', maleCount, femaleCount }`.
`validateCompetitorComposition` requires non-negative integer counts and a total consistent with the
kind (`single` = 1, `pair` = 2, `team` ≥ 2). Pure — no DB, no client trust in this phase.

---

## 7. Plan for later prompts

- **Prompt 15A-2 (database):** persist a snapshot per event. Proposed columns on the event row (or a
  `tournament_event_rules` child, one row per event, composite FK to `(tournament_id, event_id)` per
  the existing isolation pattern):
  - `rule_source text` (`'preset' | 'custom'`),
  - `rule_preset_key text null`, `rule_preset_version int null`,
  - `rule_category text null` (validated against the preset's variants),
  - `rule_snapshot_version int not null default 1`,
  - `rule_requires_configuration boolean not null default false`,
  - `rule_snapshot jsonb not null` (the serialized `EventRuleSnapshot.rules`).
  Writes go through a `SECURITY DEFINER` RPC (admin-only, `REVOKE … FROM PUBLIC, anon, authenticated`),
  re-validating with `validateEventRuleSnapshot` server-side. Public reads expose only non-sensitive
  rule fields. Migration + rollback authored but run only on the local WSL/Docker stack first.
- **Prompt 15B/15C (UI + integration):** admin picker (`listRulePresets`) + per-event rule editor
  (override flow), public "rules" display, and wiring `validateMatchScoresByRules` /
  `calculateStartingScore` into the scoring server action **behind the snapshot** — without touching
  `deriveMatchOutcome` for events that have no snapshot. Handicap UI stays gated on BTC-confirmed
  values.

> The migration runbook is intentionally **not** updated in this phase.

---

## 8. Persistence (Prompt 15A-2 — implemented)

Prompt 15A-2 persists presets + per-event snapshots. It ships **migration #8**
(`supabase/migration_tournament_rule_engine.sql`), its rollback, a SQL test harness, an idempotent
FJP seed, and minimal server-only repository helpers. It does **not** add admin/public UI, mutation
server actions, scoring integration, handicap runtime, a production migration, or a deploy — those
remain for Prompt 15B/15C.

### 8.1 Storage model — two tables (not columns on the event row)

The §7 sketch proposed rule columns on `tournament_events`. The implemented design instead uses **two
dedicated tables**, which keeps the rule engine additive (no change to the approved event table) and
lets a preset be a first-class, versioned, admin-only template:

- **`tournament_rule_presets`** — one row per `(preset_key, version)`. `payload jsonb` is the array of
  category variants (`[{category, rules}, …]`). Metadata columns: `label`, `description`,
  `schema_version`, `is_default` (CHECK-pinned **false** — a preset is never the global default),
  `requires_configuration`, `status` (`active|deprecated`).
- **`tournament_event_rule_snapshots`** — one row per event (`UNIQUE(event_id)`, FK →
  `tournament_events(id) ON DELETE CASCADE`). `payload jsonb` is the deep-copied **RuleSet**
  (`{group, knockout, handicap}`). Metadata is promoted to typed columns: `source`
  (`default|preset|custom`), `preset_key`/`preset_version` (**provenance only, NOT a foreign key**),
  `category`, `schema_version`, `snapshot_version`, `requires_configuration`, and `version`
  (optimistic-concurrency, trigger-bumped like `tournament_events`/`tournament_matches`).

**Columns + JSONB hybrid (rationale):** fields that callers *query or gate on* (source, provenance,
snapshot/schema version, requires_configuration, concurrency version) are columns; the rule *content*
lives in JSONB, governed by `schema_version` + minimal structural CHECKs (`payload` must be a
non-empty array for presets / non-empty object for snapshots). The **TypeScript domain**
(`validation.ts`) remains the authoritative validator; the DB CHECKs are a coarse guard, not a
re-implementation. No executable code / function text is ever stored.

### 8.2 Snapshot independence (DB-enforced)

There is **no foreign key** from a snapshot's `preset_key/preset_version` to `tournament_rule_presets`.
A preset `UPDATE` or `DELETE` therefore can never mutate or cascade into an existing snapshot — the
snapshot is a self-contained deep copy, exactly as the pure domain guarantees. A SQL test updates the
preset payload and asserts the snapshot payload is byte-unchanged. The application is responsible for
*creating* the deep copy at apply-time (`createSnapshotPayload`), which is safer and clearer than a DB
trigger that copies preset rows.

### 8.3 Public-safe projection

Guests never read either base table. A `SECURITY DEFINER` RPC
**`tournament_public_event_rule_summary(event_id)`** (pinned `search_path`, event-visibility guarded)
returns only a minimal scoring **summary**: group + knockout `points_to_win / win_by / points_cap`,
`tie_break_order` labels, `handicap_enabled` (bool), `category`, and the preset `label`. It exposes
**no** admin/internal fields (no preset id, `snapshot_version`, `requires_configuration` internals,
`version`, or audit). The `RETURNS TABLE(...)` signature makes leaking an internal column a compile
error. The pure mapper `toPublicEventRuleSummary()` shapes the RPC row into `PublicEventRuleSummary`.

### 8.4 RLS & grants

Both tables: RLS enabled, a single `*_service_all FOR ALL TO service_role` policy, **no** public
SELECT policy, and `REVOKE ALL … FROM anon, authenticated` (no REST + no Realtime leakage of rule
administration metadata). This mirrors the qualification-override privacy fix (migration 7). Presets
are admin-only templates — Guests see rules only through the per-event summary RPC. Every future admin
write must still `authenticate → checkIsAdmin() → createAdminClient()`; the service-role client is
never imported into a Client Component.

### 8.5 Repository helpers (server-only)

- `lib/tournaments/rules/persistence.ts` (**pure**): `createSnapshotPayload(eventId, snapshot)` →
  DB row; `toPublicEventRuleSummary(row)` → safe summary; `RULE_SCHEMA_VERSION`.
- `lib/tournaments/admin/ruleQueries.ts` (**server-only, service-role**): `getRulePresetForAdmin`,
  `listRulePresetsForAdmin`, `getEventRuleSnapshotForAdmin` (reads only; no mutations — those are 15B).
- `lib/tournaments/public/ruleSummary.ts` (**server-only, anon client + safe RPC**):
  `getPublicEventRuleSummary(eventId)`.

### 8.6 FJP seed & handicap blocker

`supabase/seed_tournament_rule_presets.sql` is an **idempotent** (`ON CONFLICT (preset_key, version)
DO UPDATE`) seed of the FJP preset — the DB mirror of `buildFjpOlympiad2026Preset()`. It seeds **only**
the template (no tournament/event/snapshot rows) and is public-invisible. The **handicap blocker
persists**: the seeded preset carries `requires_configuration = true` and `handicap.entries = []`; the
concrete FJP handicap numbers are still unconfirmed and were **not invented**. Applying it to live
scoring still returns the typed `HANDICAP_NOT_CONFIGURED` error.

### 8.7 Competitor composition — deferred

`CompetitorComposition` (needed for handicap matching) is **not** persisted in this phase. Handicap is
unconfigured and scoring integration is deferred to 15B/15C, so a snapshot needs no per-competitor
composition to be stored yet. Adding a nullable `composition jsonb` (null = unconfigured) to
`tournament_competitors` is left as an **additive** migration for the phase that wires handicap
runtime — no existing migration is touched. This keeps migration #8 minimal.

### 8.8 Left for Prompt 15B/15C

Admin preset picker + per-event rule editor (override flow) with guarded `SECURITY DEFINER`/service-
role writes re-validating via `validateEventRuleSnapshot`; public "rules" display consuming the summary
RPC; wiring `validateMatchScoresByRules` / `calculateStartingScore` into the scoring action **behind
the snapshot**; competitor-composition persistence; and the **BTC-confirmed** handicap numbers. The
**production** migration + deploy stay gated on the operator (see the runbook's rule-engine section).

---

## Prompt 15B-2 status

15B-2 shipped the scoped management routes/roles and refactored action guards to scoped permissions.
The `rules.manage` permission exists in the role map (managers hold it) but is **not yet wired to any
UI or mutation** — the rule preset picker, the per-event rule editor and the scoring runtime (15/21
laws, handicap) remain deferred to **Prompt 15C**.

---

## Prompt 15C-1 — Rule preset picker & event rule snapshot editor (Admin/Manager UI)

15C-1 wires the rule engine to the admin UI. It is **UI + server actions only**; the scoring runtime
(15/21 laws, real handicap numbers) and schedule reset remain deferred to **Prompt 15C-2**.

### Surface
A new **“Luật thi đấu”** tab in the shared event workspace (`.../noi-dung/[eventId]`), mounted
identically on the Site-Admin (`/admin/giai-dau`) and scoped (`/quan-ly-giai-dau`) routes via one
implementation: `EventDetailTabs` (top-level tabs) → `EventRulesPanel` (server data-loader) →
`RuleWorkspace` (client). The picker/editor render only when the viewer holds `rules.manage`;
everyone else who can view the workspace sees a read-only summary.

### Empty state (no snapshot yet)
A snapshot is **never auto-created** by opening the page. When an event has none, the workspace
offers three explicit choices: use the current **default** rules, choose a **preset**, or build a
**custom** rule set. The admin/manager must confirm (save) before anything is written. A legacy event
with no snapshot keeps working on the old scoring — nothing is forced onto it.

### Preset picker & preview
Presets are read from the DB (`listRulePresetsForPicker`, service-role) — never hardcoded in a Client
Component. For FJP the picker shows the label + version, the **not-the-default** note, both category
variants (Beginner / Standard) and the **requires-configuration** (handicap) state. Category is chosen
explicitly and is **never inferred from the event name**. The preview renders human labels (touch-15
group / touch-21 group, knockout touch-21 win-by-2 cap 31, table points, tie-break order) — never raw
JSON.

### Server actions (`lib/tournaments/admin/ruleService.ts`, wrapped by `rule-actions.ts`)
`applyRulePresetToEvent`, `createCustomEventRuleSnapshot`, `updateEventRuleSnapshot`,
`acknowledgeRuleWarning`. Every mutation: authenticate → `checkTournamentPermission(id,'rules.manage')`
→ verify the event belongs to the tournament (anti-IDOR) → reload DB truth → **safety guard** →
build+validate with the pure engine (`buildRuleSetFromEditorFields` / `applyRulePreset` /
`createEventRuleSnapshot` / `validateEventRuleSnapshot`) → mutate via service-role → audit → revalidate
both mounts. The service-role client is created **only after** the check passes and is never imported
into the client (DTOs live in the pure `lib/tournaments/rules/views.ts`).

### Snapshot independence & optimistic concurrency
Applying a preset deep-copies the variant (`applyRulePreset`) — later preset edits can never change a
live snapshot. `updateEventRuleSnapshot` takes an `expectedVersion` and pins it in the UPDATE `WHERE`
(`.eq('version', expectedVersion)`), returning `version_conflict` on a stale write. Two concurrent
edits are never auto-merged. Editing bumps the domain `snapshot_version`; the DB `version` column is
the trigger-bumped concurrency token.

### Conservative safety guard (§14)
`evaluateRuleMutationGuard({matchCount, completedMatchCount})`: any completed match/score →
`event_rules_locked`; matches generated but unscored → `event_requires_schedule_reset`. The server
checks DB truth; nothing resets a schedule/bracket in this Prompt.

### Handicap blocker (§15)
The FJP preset ships `requires_configuration = true` with **no** handicap entries. The UI shows the
incomplete-handicap warning (icon + text, not colour alone), never presents the preset as “complete”,
and an unacknowledged `requires_configuration` snapshot is rejected server-side
(`warning_not_acknowledged`). Acknowledgement is recorded in the audit (`event_rule_warning_acknowledged`).
No handicap numbers are invented.

### Tie-break editor (§12)
Move up/down (full keyboard) + add/remove; **no duplicate token**; tokens the runtime cannot evaluate
automatically (`head_to_head`, `organizer_decision`, `random_draw`) are kept and flagged **manual** —
never silently dropped.

### Audit actions
`event_rule_preset_applied`, `event_rule_snapshot_created`, `event_rule_snapshot_updated`,
`event_rule_warning_acknowledged`, `event_rule_snapshot_reset`, `event_rule_snapshot_deleted` —
metadata carries ids / source / preset key+version / category / snapshot version before/after /
changed field paths / requires_configuration; never a token/cookie/session.

## Prompt 15C-2 additions

### Public rule summary (§4–§5)
The public detail page (`/giai-dau/[slug]`) gains a **Luật thi đấu** tab. It reads ONLY the
`tournament_public_event_rule_summary(event_id)` SECURITY DEFINER RPC (via `createPublicClient()` — no
service role, no base-table read) mapped by the pure `toPublicEventRuleSummary()`. It shows source
(preset label / custom), category, group + knockout scoring (points-to-win / win-by / cap), tie-break
order, and handicap on/off (on → "pending organizer setup"). It exposes NO internal field (no
snapshot/preset id, no version, no `requires_configuration` internals, no actor, no audit). The RPC's
own `WHERE tournament_event_is_public` gate means a draft/archived event never leaks a summary. A
**legacy event with no snapshot** shows "system default rules" and is never auto-created.

### Reset & delete lifecycle (§6–§7)
- **`resetEventRuleSnapshotToPreset`** — re-copies the EXACT `(preset_key, preset_version)` the snapshot
  was created from (never the newest version; a gone version → typed `preset_version_gone`), keeps the
  category, bumps `snapshot_version`, validates with the pure engine, and is pinned by optimistic
  concurrency. Only a preset-sourced snapshot can reset (`not_preset_sourced` otherwise).
- **`deleteEventRuleSnapshot`** — allowed ONLY in setup (the same conservative guard); deletes the row
  so the event falls back to the system default rules. Never deletes the preset, never touches another
  event, version-pinned.

### Locking (§8) & version-conflict UX (§9)
A generated-but-unscored schedule makes the rule tab read-only with a "reset the schedule in the
Competition tab first" hint (no auto-reset, no silent discard). A recorded result hard-locks all rule
mutations while the public summary keeps reading the current snapshot. On `version_conflict` the UI
shows a banner + **Reload** button and never auto-merges or discards the draft before the user reloads.

### Left for Prompt 15D
Scoring runtime under the snapshot (15/21 laws), real handicap calculation, and automatic
schedule/bracket reset on a rule change. No new migration; no commit-time production SQL.

## Prompt 15D-1 — Rule-aware scoring runtime

The event rule snapshot now DRIVES score entry. Pure logic lives in `lib/tournaments/rules/scoring.ts`
(no I/O); the server glue is `lib/tournaments/admin/scoringRuntime.ts`.

### Stage resolution — `resolveMatchScoringRules(descriptor, ruleSet)`
Maps a match's physical placement to the rules that judge it:
- group / round-robin match → **group rules**;
- knockout match — championship, consolation, third-place, or the pure-knockout (null) bracket — all →
  **knockout rules** (third-place is structurally a knockout match);
- a **BYE** → typed `bye_not_scoreable`; an unknown stage → typed `match_stage_unsupported` (never a
  silent fallback).

### Evaluation — `evaluateMatchScoreWithSnapshot({ rules, stage, games })`
Reuses the engine (`validateGameScoreByRules` / `validateMatchScoresByRules`) — the 15/21 / win-by /
deuce-cap laws are NOT re-implemented. It also rejects a game recorded after a side already reached
`games_to_win` (`match_already_decided`). An **enabled** handicap fails closed here
(`handicap_not_configured`) — 15D-1 never applies a handicap value; a **disabled** handicap scores
normally. The winner is always derived from the scores — there is no winner input.

### Server runtime — `resolveMatchScore(...)`
Every score mutation (group / knockout / group-knockout save + the correction preview/reset) calls
this ONE entry point after verifying ownership + a scoreable pairing:
- **no snapshot → legacy fallback**: the exact previous behaviour (`validateMatchScores` →
  `deriveMatchOutcome`), tagged `legacy_default`. Never auto-creates a snapshot; old events are
  unchanged.
- **snapshot present → authoritative**. An **invalid** snapshot blocks the save
  (`rules_snapshot_invalid`) and does NOT fall back to legacy.
- The rule payload is always loaded from the DB snapshot — never trusted from the client (no client
  rule / winner / stage / starting score).

### Standings table points (§15)
`calculateStandings` / `evaluateGroupStage` take an optional `tablePoints` config (default win 1 /
loss 0). The snapshot's `win_table_points` / `loss_table_points` flow into the scoring-time evaluation,
the standings display and the group-knockout qualification via `getEventGroupTablePoints(eventId)`.
The FJP preset uses the defaults, so its behaviour is unchanged.

### Audit (§16)
Each stored result records safe rule metadata under `detail.rule`: rule source, preset key/version,
snapshot version, category, match stage, games-to-win, points-to-win, win-by, cap, handicap state.
Never a raw payload, token or secret.

### Left for Prompt 15D-2
Real handicap starting-score / adjustment application (values still organizer-pending), automatic
schedule/bracket reset on a rule change, a full scoring browser E2E, and public-standings table-point
consistency. No new migration; no production SQL, commit, merge or deploy in 15D-1.

## Controlled rule change, reset & regeneration (Prompt 15D-2)

The conservative guard (`evaluateRuleMutationGuard`) blocks a naive rule edit once matches exist. 15D-2
adds the **controlled** path so an organizer can change scoring rules AFTER a schedule/bracket exists,
without ever leaving old scores under new rules. All the decision logic is a PURE module,
`lib/tournaments/rules/change.ts`:

- **`classifyRuleChange(before, after)`** — path-driven, never keyed on a field label. Returns three
  orthogonal flags — `affectsMatchScoring` (points_to_win / win_by / points_cap / games_to_win /
  max_games / allow_tied_game / handicap.*), `affectsStandings` (table win/loss points),
  `affectsQualification` (tie-break order + table points) — and a `severity` of `none` / `scoring` /
  `structural`.
- **`deriveRuleChangeGuard(state, change)`** — maps the current match/score state to a controlled mode:
  `direct` (no matches → update in place), `reset` (generated, unscored → schedule reset),
  `destructive` (results exist → full reset, requires an explicit confirmation phrase), `no_change`.
- **`summarizeRuleChangeImpact`** — counts only (never identities) of what a reset touches, plus which
  regeneration modes apply (a `group_knockout` bracket is never auto-seeded — §10).
- **`computeRuleChangeImpactToken`** — a deterministic FNV-1a fingerprint over event/snapshot versions,
  per-match versions, generation keys and the proposed rules. The mutation recomputes it from fresh
  truth and refuses a stale preview (`rule_change_impact_stale`). Never minted by the client.

The atomic mutation is the SQL RPC `tournament_apply_rule_change` (migration #11): validation → one
savepoint block that resets downstream (podium → qualification overrides → games → matches), updates
the snapshot and regenerates the round-robin schedule — all-or-nothing. FJP v2 is untouched; a completed
event is blocked until reopened; the preset is never mutated.
