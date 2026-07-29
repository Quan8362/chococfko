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

## 5. Handicap — known and still needed

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
