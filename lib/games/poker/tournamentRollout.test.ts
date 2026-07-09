import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseRolloutPct,
  effectiveRolloutPct,
  rolloutBucket,
  resolvePublicRollout,
  inPublicRollout,
  publicRolloutEnabled,
  ALLOWED_ROLLOUT_PCTS,
  ROLLOUT_PHASE_CEILING,
  PUBLIC_ROLLOUT_ENABLED_ENV,
  PUBLIC_ROLLOUT_PCT_ENV,
  PUBLIC_TESTER_IDS_ENV,
  PUBLIC_TESTER_MAX,
  parsePublicTesterIds,
  type PublicRolloutConfig,
} from './tournamentRollout.ts'

// A deterministic pool of opaque, UUID-shaped ids (no Math.random — reproducible in CI).
function idPool(n: number): string[] {
  const ids: string[] = []
  let h = 0x9e3779b9 >>> 0
  for (let i = 0; i < n; i++) {
    h ^= i + 0x6d2b79f5
    h = Math.imul(h ^ (h >>> 15), 1 | h)
    const a = (h >>> 0).toString(16).padStart(8, '0')
    const b = (Math.imul(h, 0x85ebca6b) >>> 0).toString(16).padStart(8, '0')
    ids.push(`${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${a.slice(0, 3)}-${a}${b.slice(0, 4)}`)
  }
  return ids
}

function cfg(over: Partial<PublicRolloutConfig> = {}): PublicRolloutConfig {
  return { masterEnabled: true, configuredPct: 0, pct: 0, testerIds: [], ...over }
}

// ── Percentage parsing / validation (fail closed) ──────────────────────────────────────────────
test('RLO-PARSE-001 only {0,5,10,25,50,100} are valid; everything else → 0', () => {
  for (const p of ALLOWED_ROLLOUT_PCTS) assert.equal(parseRolloutPct(String(p)), p)
  for (const bad of ['', ' ', 'abc', '37', '7', '-5', '101', '1000', 'NaN', '5.5', '0x5', '  10 ', null, undefined]) {
    // note: '  10 ' trims to a valid 10 — assert that one explicitly below, others → 0
    if (bad === '  10 ') continue
    assert.equal(parseRolloutPct(bad as string), 0, `expected 0 for ${JSON.stringify(bad)}`)
  }
  assert.equal(parseRolloutPct('  10 '), 10) // surrounding whitespace tolerated
})

test('RLO-PARSE-002 phase ceiling: 100 is a valid value but resolves to an EFFECTIVE 0 this phase', () => {
  assert.equal(ROLLOUT_PHASE_CEILING, 50)
  assert.equal(parseRolloutPct('100'), 100) // valid as a configured value
  assert.equal(effectiveRolloutPct('100'), 0) // NOT activatable during 27G-N → fail closed to 0
  // Everything at/under the ceiling passes through unchanged.
  for (const p of [0, 5, 10, 25, 50]) assert.equal(effectiveRolloutPct(String(p)), p)
})

// ── Deterministic, stable bucketing ────────────────────────────────────────────────────────────
test('RLO-BUCKET-001 bucket is in [0,99] and STABLE for a given id', () => {
  for (const id of idPool(200)) {
    const b = rolloutBucket(id)
    assert.ok(Number.isInteger(b) && b >= 0 && b < 100, `bucket out of range: ${b}`)
    assert.equal(rolloutBucket(id), b) // same id → same bucket, always
  }
})

test('RLO-BUCKET-002 same user stays in the same rollout decision as % increases (monotonic membership)', () => {
  // A user in the rollout at 5% must still be in it at 10/25/50 (their bucket never moves).
  for (const id of idPool(500)) {
    const b = rolloutBucket(id)
    const stages = [5, 10, 25, 50]
    let wasIn = false
    for (const pct of stages) {
      const isIn = inPublicRollout(cfg({ pct: pct as PublicRolloutConfig['pct'] }), { userId: id })
      assert.equal(isIn, b < pct)
      if (wasIn) assert.ok(isIn, `id left the rollout when % increased`)
      wasIn = wasIn || isIn
    }
  }
})

test('RLO-BUCKET-003 distribution roughly matches each configured % (deterministic pool)', () => {
  const ids = idPool(5000)
  for (const pct of [5, 10, 25, 50] as const) {
    const inCount = ids.filter((id) => inPublicRollout(cfg({ pct }), { userId: id })).length
    const frac = (inCount / ids.length) * 100
    // Generous tolerance — this asserts "not wildly off", not statistical exactness.
    assert.ok(Math.abs(frac - pct) <= 3, `pct=${pct} got ${frac.toFixed(2)}% in-rollout`)
  }
})

// ── The authoritative decision (fail closed at every step) ──────────────────────────────────────
test('RLO-GATE-001 default 0% denies ordinary public users', () => {
  for (const id of idPool(300)) {
    assert.equal(inPublicRollout(cfg({ pct: 0 }), { userId: id }), false)
  }
})

test('RLO-GATE-002 anonymous users are always denied, even at 100 effective', () => {
  assert.equal(inPublicRollout(cfg({ pct: 50 }), { userId: null }), false)
  assert.equal(inPublicRollout(cfg({ pct: 50 }), { userId: undefined }), false)
  assert.equal(inPublicRollout(cfg({ pct: 50 }), { userId: '' }), false)
})

test('RLO-GATE-003 master kill switch OFF overrides everything (even a bucketed 50%)', () => {
  // Find an id that WOULD be in at 50%, then prove the master switch denies it.
  const id = idPool(2000).find((x) => rolloutBucket(x) < 50)!
  assert.ok(id, 'expected at least one in-bucket id')
  assert.equal(inPublicRollout(cfg({ masterEnabled: true, pct: 50 }), { userId: id }), true)
  assert.equal(inPublicRollout(cfg({ masterEnabled: false, pct: 50 }), { userId: id }), false)
})

test('RLO-GATE-004 suspended tester denied on the public path', () => {
  const id = idPool(2000).find((x) => rolloutBucket(x) < 50)!
  assert.equal(inPublicRollout(cfg({ pct: 50 }), { userId: id, suspended: true }), false)
  assert.equal(inPublicRollout(cfg({ pct: 50 }), { userId: id, suspended: false }), true)
})

// ── Env resolution (server reads these) ────────────────────────────────────────────────────────
test('RLO-ENV-001 resolvePublicRollout: fail-closed defaults from an empty env', () => {
  const r = resolvePublicRollout({})
  assert.deepEqual(r, { masterEnabled: false, configuredPct: 0, pct: 0, testerIds: [] })
  assert.equal(publicRolloutEnabled(r), false)
})

test('RLO-ENV-002 resolvePublicRollout: master + valid % wire through; 100 caps to effective 0', () => {
  const at5 = resolvePublicRollout({ [PUBLIC_ROLLOUT_ENABLED_ENV]: 'true', [PUBLIC_ROLLOUT_PCT_ENV]: '5' })
  assert.deepEqual(at5, { masterEnabled: true, configuredPct: 5, pct: 5, testerIds: [] })

  const at100 = resolvePublicRollout({ [PUBLIC_ROLLOUT_ENABLED_ENV]: '1', [PUBLIC_ROLLOUT_PCT_ENV]: '100' })
  assert.equal(at100.masterEnabled, true)
  assert.equal(at100.configuredPct, 100) // configured value is recorded…
  assert.equal(at100.pct, 0) // …but not activatable this phase → effective 0

  // A malformed % with the master ON still fails closed to 0 effective.
  const bad = resolvePublicRollout({ [PUBLIC_ROLLOUT_ENABLED_ENV]: 'on', [PUBLIC_ROLLOUT_PCT_ENV]: 'lots' })
  assert.equal(bad.masterEnabled, true)
  assert.equal(bad.pct, 0)
})

test('RLO-ENV-003 only explicit affirmatives arm the master switch', () => {
  for (const on of ['1', 'true', 'on', 'yes', 'TRUE', ' Yes ']) {
    assert.equal(resolvePublicRollout({ [PUBLIC_ROLLOUT_ENABLED_ENV]: on }).masterEnabled, true, on)
  }
  for (const off of ['', '0', 'false', 'off', 'no', 'enabled', 'y', undefined]) {
    assert.equal(resolvePublicRollout({ [PUBLIC_ROLLOUT_ENABLED_ENV]: off as string }).masterEnabled, false, String(off))
  }
})

// ── No client-supplied bucket can be honoured ───────────────────────────────────────────────────
test('RLO-SEC-001 the decision is a pure function of the SERVER config + auth id only', () => {
  // inPublicRollout accepts no percentage/bucket/override from a caller context beyond the auth id
  // and the suspend flag; there is no field a client could set to force inclusion. Prove that two
  // ids with the master off are both denied regardless of any (nonexistent) client percentage.
  const ids = idPool(50)
  for (const id of ids) {
    assert.equal(inPublicRollout(cfg({ masterEnabled: false, pct: 50 }), { userId: id }), false)
  }
})

// ── Temporary tester allowlist (27G-N Stage 3A) — fail closed, visibility-only ──────────────────
const UUID_A = '00000000-0000-4000-8000-000000000001'
const UUID_B = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
const UUID_C = '12345678-1234-4234-8234-123456789abc'

test('RLO-TESTER-001 parse: unset/empty/whitespace → [] (dormant)', () => {
  for (const raw of [undefined, null, '', '   ', ',', ' , , ']) {
    assert.deepEqual(parsePublicTesterIds(raw as string), [])
  }
})

test('RLO-TESTER-002 parse: valid ids trimmed, lower-cased, de-duped', () => {
  assert.deepEqual(parsePublicTesterIds(`  ${UUID_A} , ${UUID_B} `), [UUID_A, UUID_B])
  assert.deepEqual(parsePublicTesterIds(UUID_A.toUpperCase()), [UUID_A]) // case-insensitive
  assert.deepEqual(parsePublicTesterIds(`${UUID_A},${UUID_A}`), [UUID_A]) // de-duped
})

test('RLO-TESTER-003 parse: ANY malformed token fails the WHOLE list closed', () => {
  for (const bad of ['not-a-uuid', `${UUID_A},garbage`, `${UUID_A},123`, `${UUID_A},${UUID_B.slice(0, -1)}`]) {
    assert.deepEqual(parsePublicTesterIds(bad), [], `expected [] for ${JSON.stringify(bad)}`)
  }
})

test('RLO-TESTER-004 parse: more than PUBLIC_TESTER_MAX valid ids fails closed', () => {
  assert.equal(PUBLIC_TESTER_MAX, 2)
  assert.deepEqual(parsePublicTesterIds(`${UUID_A},${UUID_B},${UUID_C}`), []) // 3 > max → []
})

test('RLO-TESTER-005 an allowlisted id is admitted at effective 0% (percentage unchanged)', () => {
  const c = cfg({ pct: 0, testerIds: [UUID_A, UUID_B] })
  assert.equal(inPublicRollout(c, { userId: UUID_A }), true)
  assert.equal(inPublicRollout(c, { userId: UUID_B.toUpperCase() }), true) // case-insensitive match
  // A non-listed user is still gated by the (still-zero) percentage.
  assert.equal(inPublicRollout(c, { userId: UUID_C }), false)
})

test('RLO-TESTER-006 allowlist NEVER overrides kill switch / anon / suspension', () => {
  const listed = { userId: UUID_A }
  assert.equal(inPublicRollout(cfg({ masterEnabled: false, testerIds: [UUID_A] }), listed), false) // kill switch wins
  assert.equal(inPublicRollout(cfg({ testerIds: [UUID_A] }), { userId: null }), false) // anon
  assert.equal(inPublicRollout(cfg({ testerIds: [UUID_A] }), { userId: UUID_A, suspended: true }), false) // suspended
})

test('RLO-TESTER-007 allowlist does not perturb ordinary bucket decisions', () => {
  // With an allowlist that does NOT contain them, ordinary users get exactly the bucket decision.
  for (const id of idPool(300)) {
    const withList = inPublicRollout(cfg({ pct: 25, testerIds: [UUID_A, UUID_B] }), { userId: id })
    const without = inPublicRollout(cfg({ pct: 25 }), { userId: id })
    assert.equal(withList, without)
  }
})

test('RLO-TESTER-008 resolvePublicRollout wires the env; empty env → dormant []', () => {
  assert.deepEqual(resolvePublicRollout({}).testerIds, [])
  const r = resolvePublicRollout({
    [PUBLIC_ROLLOUT_ENABLED_ENV]: 'true',
    [PUBLIC_ROLLOUT_PCT_ENV]: '25',
    [PUBLIC_TESTER_IDS_ENV]: `${UUID_A}, ${UUID_B}`,
  })
  assert.deepEqual(r, { masterEnabled: true, configuredPct: 25, pct: 25, testerIds: [UUID_A, UUID_B] })
})
