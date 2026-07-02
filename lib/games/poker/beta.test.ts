import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BETA_COHORTS,
  BETA_COHORT_ENV,
  BETA_SUSPENDED_ENV,
  BETA_TERMS_VERSION,
  parseEmailList,
  resolveBetaMembership,
  isBetaMember,
  isBetaSuspended,
  buildBetaRoster,
  needsBetaTermsAck,
  isBetaMaintenance,
  BETA_MAINTENANCE_ENV,
  evaluateBetaSuccess,
  BETA_SUCCESS_TARGETS,
  type BetaMeasuredMetrics,
} from './beta.ts'

const env = (o: Record<string, string>) => o as Record<string, string | undefined>

test('BETA-PARSE-001 email list is trimmed, lower-cased, de-duped', () => {
  assert.deepEqual(parseEmailList(' A@x.com, b@x.com ,A@X.COM,'), ['a@x.com', 'b@x.com'])
  assert.deepEqual(parseEmailList(''), [])
  assert.deepEqual(parseEmailList(null), [])
})

test('BETA-MEMBER-001 resolves cohort membership case-insensitively', () => {
  const e = env({ [BETA_COHORT_ENV.technical]: 'dev@fko.com, qa@fko.com' })
  const m = resolveBetaMembership('DEV@fko.com', e)
  assert.equal(m.inBeta, true)
  assert.equal(m.cohort, 'technical')
  assert.equal(m.suspended, false)
  assert.equal(isBetaMember('qa@fko.com', e), true)
  assert.equal(isBetaMember('nobody@x.com', e), false)
  assert.equal(isBetaMember(null, e), false)
})

test('BETA-MEMBER-002 first (most-trusted) cohort wins when an email is in several', () => {
  const e = env({
    [BETA_COHORT_ENV.community]: 'x@fko.com',
    [BETA_COHORT_ENV.internal_admin]: 'x@fko.com',
    [BETA_COHORT_ENV.technical]: 'x@fko.com',
  })
  assert.equal(resolveBetaMembership('x@fko.com', e).cohort, 'internal_admin')
})

test('BETA-SUSPEND-001 suspend list is reported and takes precedence for lockout', () => {
  const e = env({
    [BETA_COHORT_ENV.experienced]: 'p@fko.com',
    [BETA_SUSPENDED_ENV]: 'p@fko.com',
  })
  const m = resolveBetaMembership('p@fko.com', e)
  assert.equal(m.inBeta, true, 'still shows the cohort so the dashboard can explain the lockout')
  assert.equal(m.cohort, 'experienced')
  assert.equal(m.suspended, true)
  assert.equal(isBetaSuspended('P@fko.com', e), true)
})

test('BETA-ROSTER-001 roster is a non-overlapping partition with correct counts', () => {
  const e = env({
    [BETA_COHORT_ENV.internal_admin]: 'a@fko.com',
    [BETA_COHORT_ENV.technical]: 'a@fko.com, b@fko.com', // a de-duped into internal_admin
    [BETA_COHORT_ENV.community]: 'c@fko.com',
    [BETA_SUSPENDED_ENV]: 'c@fko.com',
  })
  const r = buildBetaRoster(e)
  assert.deepEqual(r.cohorts.internal_admin, ['a@fko.com'])
  assert.deepEqual(r.cohorts.technical, ['b@fko.com'])
  assert.deepEqual(r.cohorts.community, ['c@fko.com'])
  assert.equal(r.counts.technical, 1)
  assert.equal(r.total, 3)
  assert.equal(r.activeTotal, 2, 'suspended c@ excluded from active total')
})

test('BETA-COHORT-ENV-001 every cohort has a distinct env key', () => {
  const keys = BETA_COHORTS.map((c) => BETA_COHORT_ENV[c])
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(keys.length, 5)
})

test('BETA-MAINT-001 maintenance resolves only on explicit affirmative', () => {
  for (const v of ['1', 'true', 'TRUE', ' on ', 'Yes']) {
    assert.equal(isBetaMaintenance(env({ [BETA_MAINTENANCE_ENV]: v })), true, `value=${v}`)
  }
  for (const v of ['', '0', 'false', 'off', 'nope']) {
    assert.equal(isBetaMaintenance(env({ [BETA_MAINTENANCE_ENV]: v })), false, `value=${v}`)
  }
  assert.equal(isBetaMaintenance(env({})), false)
})

test('BETA-TERMS-001 ack required when never acked or version behind', () => {
  assert.equal(needsBetaTermsAck(null), true)
  assert.equal(needsBetaTermsAck(undefined), true)
  assert.equal(needsBetaTermsAck(BETA_TERMS_VERSION - 1), true)
  assert.equal(needsBetaTermsAck(BETA_TERMS_VERSION), false)
  assert.equal(needsBetaTermsAck(BETA_TERMS_VERSION + 1), false)
})

const perfect: BetaMeasuredMetrics = {
  privateCardExposures: 0,
  coinConservationFailures: 0,
  duplicateSettlements: 0,
  completedHands: BETA_SUCCESS_TARGETS.minCompletedHands,
  uniqueTesters: BETA_SUCCESS_TARGETS.minUniqueTesters,
  deviceClasses: BETA_SUCCESS_TARGETS.minDeviceClasses,
  reconnectSuccessRate: 1,
  handCompletionRate: 1,
  actionSuccessRate: 1,
  criticalBugsOpen: 0,
  highBugsOpen: 0,
}

test('BETA-SUCCESS-001 all targets met when metrics hit thresholds', () => {
  const ev = evaluateBetaSuccess(perfect)
  assert.equal(ev.allMet, true)
  assert.equal(ev.safetyBreached, false)
})

test('BETA-SUCCESS-002 any private-card exposure is a hard safety breach', () => {
  const ev = evaluateBetaSuccess({ ...perfect, privateCardExposures: 1 })
  assert.equal(ev.safetyBreached, true)
  assert.equal(ev.allMet, false)
  const r = ev.results.find((x) => x.key === 'zero_private_card_exposure')!
  assert.equal(r.status, 'not_met')
  assert.equal(r.hard, true)
})

test('BETA-SUCCESS-003 unknown safety metric is not "met" and not fabricated', () => {
  const ev = evaluateBetaSuccess({ ...perfect, coinConservationFailures: null })
  const r = ev.results.find((x) => x.key === 'zero_coin_conservation_failure')!
  assert.equal(r.status, 'unknown')
  assert.equal(r.actual, '—')
  assert.equal(ev.allMet, false, 'unknown blocks allMet')
  assert.equal(ev.safetyBreached, false, 'unknown is not a confirmed breach')
})

test('BETA-SUCCESS-004 below-threshold tunable target reports not_met but no safety breach', () => {
  const ev = evaluateBetaSuccess({ ...perfect, completedHands: 1, highBugsOpen: 99 })
  assert.equal(ev.safetyBreached, false)
  assert.equal(ev.allMet, false)
  assert.equal(ev.results.find((x) => x.key === 'min_completed_hands')!.status, 'not_met')
  assert.equal(ev.results.find((x) => x.key === 'max_high_bugs_open')!.status, 'not_met')
})
