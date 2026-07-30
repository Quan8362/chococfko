import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Prompt 15D-1 — structural guarantees for the RULE-AWARE SCORING RUNTIME that cannot be pure unit
// tests but still MUST hold. Every score mutation must judge the score through the ONE runtime
// (resolveMatchScore), never a second algorithm and never a client-supplied winner/rule. Run from
// web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const RUNTIME = 'lib/tournaments/admin/scoringRuntime.ts'

// Every action that turns entered games into a stored result / correction.
const SCORE_ACTIONS = [
  'saveGroupMatchResult',
  'saveKnockoutMatchResult',
  'saveGroupKnockoutMatchResult',
  'previewAffectedKnockoutPath',
  'resetAffectedKnockoutPath',
]

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `function ${name} not found`)
  const after = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, after === -1 ? undefined : after)
}

// 16 · every scoring flow routes through the ONE rule-aware runtime (no bypass).
test('every score action judges the score through resolveMatchScore', () => {
  const src = read(ACTIONS)
  for (const name of SCORE_ACTIONS) {
    assert.ok(actionBody(src, name).includes('resolveMatchScore('), `${name} must call resolveMatchScore`)
  }
})

// 15/16 · the legacy fixed validator is never called directly in the actions any more — a single
// evaluator owns winner derivation, and the winner comes from the server-derived result.
test('actions never call the legacy validateMatchScores directly (single evaluator)', () => {
  const src = read(ACTIONS)
  assert.ok(!src.includes('validateMatchScores('), 'actions must not re-run validateMatchScores directly')
})

test('the RPC winner is the server-derived scored.winnerId, never a client winner', () => {
  const src = read(ACTIONS)
  // The two direct save RPCs pass the derived winner id.
  assert.ok(src.includes('p_winner_id: scored.winnerId'), 'save RPCs must pass scored.winnerId')
  // No score action reads a winner from its own parameters.
  for (const name of ['saveGroupMatchResult', 'saveKnockoutMatchResult', 'saveGroupKnockoutMatchResult']) {
    const body = actionBody(src, name)
    assert.ok(!/p_winner_id:\s*(winnerId|p_winner|games)/.test(body), `${name} must not forward a client winner`)
  }
})

// 24 · cross-tournament (anti-IDOR): every score action re-verifies the event belongs to the tournament.
test('every score action verifies the event↔tournament (loadEvent) before mutating', () => {
  const src = read(ACTIONS)
  for (const name of SCORE_ACTIONS) {
    assert.ok(actionBody(src, name).includes('loadEvent('), `${name} must loadEvent (anti-IDOR)`)
  }
})

// 25 · scorekeeper has score.manage; 26 · manager has it too; Site Admin has every permission.
test('the role table grants score.manage to scorekeeper, manager and Site Admin', async () => {
  const { roleGrantsPermission, ALL_PERMISSIONS } = await import('../permissions/roles.ts')
  assert.equal(roleGrantsPermission('scorekeeper', 'score.manage'), true)
  assert.equal(roleGrantsPermission('manager', 'score.manage'), true)
  assert.ok(ALL_PERMISSIONS.includes('score.manage'), 'Site Admin (ALL_PERMISSIONS) includes score.manage')
})

// 17/18 · the runtime: legacy fallback when there is no snapshot; an INVALID snapshot blocks (never
// falls back to the legacy engine).
test('runtime falls back to the legacy engine only when there is NO snapshot', () => {
  const src = read(RUNTIME)
  // Legacy branch is guarded by the absence of a snapshot row.
  assert.ok(/if \(!snapshotRow\)/.test(src), 'legacy fallback must be gated on a missing snapshot')
  assert.ok(src.includes("source: 'legacy_default'"), 'legacy path must be labelled legacy_default')
  assert.ok(src.includes('validateMatchScores('), 'legacy path must reuse the domain validator')
})

test('runtime blocks an invalid snapshot with rules_snapshot_invalid (no legacy fallback)', () => {
  const src = read(RUNTIME)
  assert.ok(src.includes("error: 'rules_snapshot_invalid'"), 'invalid snapshot must return rules_snapshot_invalid')
  // The invalid-snapshot check sits AFTER the missing-snapshot fallback and uses validateTournamentRules.
  const idxFallback = src.indexOf('if (!snapshotRow)')
  const idxInvalid = src.indexOf('rules_snapshot_invalid')
  assert.ok(idxFallback > -1 && idxInvalid > idxFallback, 'invalid check must follow the missing-snapshot fallback')
})

test('runtime loads the rule payload from the DB snapshot, never from the client', () => {
  const src = read(RUNTIME)
  assert.ok(src.includes('getEventRuleSnapshotForAdmin('), 'runtime must load the snapshot from the DB')
})

// 22/23 · no regression: the knockout progression + podium engine calls are still present in the
// save flow (the runtime change only replaced score judging, not progression/podium).
test('progression + podium engine calls are still wired (no regression)', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes('progressKnockout('), 'knockout progression must still run')
  assert.ok(src.includes('computeKnockoutPodium(') || src.includes('calculatePodium('), 'podium must still be computed')
})

// ── Prompt 15D-1B — the official FJP handicap on the runtime ─────────────────────────────────────

// The runtime computes the head start SERVER-SIDE from DB compositions — never a client value.
test('runtime loads competitor compositions from the DB when a handicap is enabled', () => {
  const src = read(RUNTIME)
  assert.ok(src.includes('getCompetitorCompositionsForAdmin('), 'runtime must load compositions from the DB')
  // Compositions are only loaded behind the enabled-handicap guard (no needless read otherwise).
  assert.ok(/if \(rules\.handicap\.enabled\)/.test(src), 'compositions gated on an enabled handicap')
})

// 12 · a client cannot forge a starting score: the persisted starting_score comes from the resolved
// (server-computed) game, and the ScoreGameInput the client sends carries only scoreA/scoreB.
test('the persisted starting score is the server-derived value, never a client field', () => {
  const src = read(ACTIONS)
  assert.ok(src.includes('starting_score_a: g.startingScoreA'), 'payload starting score must come from the resolved game')
  assert.ok(src.includes('starting_score_b: g.startingScoreB'), 'payload starting score must come from the resolved game')
  // No score action reads a starting score from its own parameters/games.
  for (const name of SCORE_ACTIONS) {
    const body = actionBody(src, name)
    assert.ok(!/starting_score_[ab]:\s*(games|g\.scoreA|p_)/.test(body), `${name} must not forward a client starting score`)
  }
})

// Every save flow builds its games payload through the ONE helper (so no flow can skip the head start).
test('every persisting score action builds the games payload via toGamesPayload', () => {
  const src = read(ACTIONS)
  for (const name of ['saveGroupMatchResult', 'saveKnockoutMatchResult', 'saveGroupKnockoutMatchResult', 'resetAffectedKnockoutPath']) {
    assert.ok(actionBody(src, name).includes('toGamesPayload('), `${name} must build its payload via toGamesPayload`)
  }
})

// 10/11/13 · the runtime maps the new handicap blockers to their typed codes (fail closed, no 0–0).
test('runtime maps composition + starting-score blockers to typed codes', () => {
  const src = read(RUNTIME)
  for (const code of ['competitor_composition_required', 'competitor_composition_invalid', 'score_below_starting_score']) {
    assert.ok(src.includes(`'${code}'`), `runtime must map ${code}`)
  }
})
