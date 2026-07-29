import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCompetitorInput,
  parseBulkCompetitors,
  normalizeCompetitorName,
  competitorNameKey,
  COMPETITOR_NAME_MAX,
  BULK_MAX_LINES,
  type CompetitorFormValues,
} from './competitorValidation.ts'

function base(overrides: Partial<CompetitorFormValues> = {}): CompetitorFormValues {
  return { name: 'Nguyễn Văn A', shortName: '', seed: '', ...overrides }
}

test('name is required', () => {
  const r = validateCompetitorInput(base({ name: '   ' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.name, 'name_required')
})

test('name is trimmed and internal whitespace collapsed', () => {
  const r = validateCompetitorInput(base({ name: '  Anh   Tú  ' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.name, 'Anh Tú')
})

test('name over the max is rejected', () => {
  const r = validateCompetitorInput(base({ name: 'x'.repeat(COMPETITOR_NAME_MAX + 1) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.name, 'name_too_long')
})

test('empty short_name normalizes to null', () => {
  const r = validateCompetitorInput(base({ shortName: '  ' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.shortName, null)
})

test('seed must be a positive integer when present', () => {
  const bad = validateCompetitorInput(base({ seed: '0' }))
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.errors.seed, 'seed_invalid')

  const bad2 = validateCompetitorInput(base({ seed: '1.5' }))
  assert.equal(bad2.ok, false)

  const ok = validateCompetitorInput(base({ seed: '3' }))
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.value.seed, 3)
})

test('missing seed normalizes to null', () => {
  const r = validateCompetitorInput(base({ seed: '' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.seed, null)
})

test('name key ignores case and excess whitespace', () => {
  assert.equal(competitorNameKey('Anh  Tú '), 'anh tú')
  assert.equal(normalizeCompetitorName('  A   B '), 'A B')
})

// ── bulk parsing ────────────────────────────────────────────────────────────────────────────
test('bulk parse trims lines and drops blanks', () => {
  const r = parseBulkCompetitors('  A  \n\n  B\n   \nC  ')
  assert.deepEqual(r.cleaned, ['A', 'B', 'C'])
  assert.deepEqual(r.unique, ['A', 'B', 'C'])
  assert.equal(r.duplicateNames.length, 0)
  assert.equal(r.tooMany, false)
})

test('bulk parse detects duplicates within the input (case/space-insensitive)', () => {
  const r = parseBulkCompetitors('An\nBình\nan\nBình ')
  assert.deepEqual(r.unique, ['An', 'Bình'])
  assert.equal(r.duplicateNames.length, 2)
  // first-seen display forms are reported
  assert.ok(r.duplicateNames.includes('An'))
  assert.ok(r.duplicateNames.includes('Bình'))
})

test('bulk parse flags too-many lines', () => {
  const lines = Array.from({ length: BULK_MAX_LINES + 1 }, (_, i) => `P${i}`).join('\n')
  const r = parseBulkCompetitors(lines)
  assert.equal(r.tooMany, true)
})

test('bulk parse of empty input yields nothing', () => {
  const r = parseBulkCompetitors('   \n\n  ')
  assert.equal(r.cleaned.length, 0)
  assert.equal(r.unique.length, 0)
  assert.equal(r.tooMany, false)
})
