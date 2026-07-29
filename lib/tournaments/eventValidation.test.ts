import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateEventInput,
  eventFieldVisibility,
  isEventFormat,
  type EventFormValues,
} from './eventValidation.ts'

function base(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    name: 'Đơn nam',
    format: 'group_knockout',
    groupCount: '4',
    winnerQualifiersPerGroup: '2',
    consolationQualifiersPerGroup: '2',
    thirdPlaceEnabled: true,
    ...overrides,
  }
}

test('name is required and trimmed', () => {
  const r = validateEventInput(base({ name: '   ' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.name, 'name_required')
})

test('unknown format is rejected', () => {
  const r = validateEventInput(base({ format: 'swiss' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.format, 'format_invalid')
})

test('isEventFormat guards the union', () => {
  assert.equal(isEventFormat('round_robin'), true)
  assert.equal(isEventFormat('nope'), false)
  assert.equal(isEventFormat(undefined), false)
})

// ── round_robin: group_count only; qualifiers + third-place reset ──────────────────────────
test('round_robin resets qualifiers and third-place to zero/false', () => {
  const r = validateEventInput(
    base({
      format: 'round_robin',
      groupCount: '2',
      winnerQualifiersPerGroup: '3',
      consolationQualifiersPerGroup: '3',
      thirdPlaceEnabled: true,
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.groupCount, 2)
    assert.equal(r.value.winnerQualifiersPerGroup, 0)
    assert.equal(r.value.consolationQualifiersPerGroup, 0)
    assert.equal(r.value.thirdPlaceEnabled, false)
  }
})

test('round_robin requires group_count >= 1', () => {
  const r = validateEventInput(base({ format: 'round_robin', groupCount: '0' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.groupCount, 'group_count_invalid')
})

// ── knockout: no groups/qualifiers; third-place kept ────────────────────────────────────────
test('knockout neutralizes group_count and qualifiers, keeps third-place', () => {
  const r = validateEventInput(
    base({
      format: 'knockout',
      groupCount: '9',
      winnerQualifiersPerGroup: '5',
      consolationQualifiersPerGroup: '5',
      thirdPlaceEnabled: true,
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.groupCount, 1)
    assert.equal(r.value.winnerQualifiersPerGroup, 0)
    assert.equal(r.value.consolationQualifiersPerGroup, 0)
    assert.equal(r.value.thirdPlaceEnabled, true)
  }
})

test('knockout ignores an invalid group_count (field is hidden/neutralized)', () => {
  const r = validateEventInput(base({ format: 'knockout', groupCount: 'abc' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.groupCount, 1)
})

// ── group_knockout: full validation ─────────────────────────────────────────────────────────
test('group_knockout accepts a valid 4-group / 2+2 config', () => {
  const r = validateEventInput(base())
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.groupCount, 4)
    assert.equal(r.value.winnerQualifiersPerGroup, 2)
    assert.equal(r.value.consolationQualifiersPerGroup, 2)
    assert.equal(r.value.thirdPlaceEnabled, true)
  }
})

test('group_knockout requires winner qualifiers >= 1', () => {
  const r = validateEventInput(base({ winnerQualifiersPerGroup: '0' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.winnerQualifiersPerGroup, 'winner_qualifiers_invalid')
})

test('group_knockout allows consolation qualifiers = 0', () => {
  const r = validateEventInput(base({ consolationQualifiersPerGroup: '0' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.consolationQualifiersPerGroup, 0)
})

test('group_knockout rejects a negative-looking / non-numeric qualifier', () => {
  const r = validateEventInput(base({ consolationQualifiersPerGroup: '-1' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.consolationQualifiersPerGroup, 'consolation_qualifiers_invalid')
})

test('group_count is capped by the sanity limit', () => {
  const r = validateEventInput(base({ groupCount: '999' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.groupCount, 'group_count_invalid')
})

test('eventFieldVisibility matches the conditional-settings spec', () => {
  assert.deepEqual(eventFieldVisibility('round_robin'), {
    groupCount: true,
    winnerQualifiers: false,
    consolationQualifiers: false,
    thirdPlace: false,
  })
  assert.deepEqual(eventFieldVisibility('knockout'), {
    groupCount: false,
    winnerQualifiers: false,
    consolationQualifiers: false,
    thirdPlace: true,
  })
  assert.deepEqual(eventFieldVisibility('group_knockout'), {
    groupCount: true,
    winnerQualifiers: true,
    consolationQualifiers: true,
    thirdPlace: true,
  })
})
