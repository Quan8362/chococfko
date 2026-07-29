import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTournamentInput,
  slugifyTournament,
  normalizeSlug,
  normalizeRulesUrl,
  type TournamentFormValues,
} from './validation.ts'

function base(overrides: Partial<TournamentFormValues> = {}): TournamentFormValues {
  return {
    name: 'FKO Open 2026',
    slug: 'fko-open-2026',
    startsAt: '',
    endsAt: '',
    location: '',
    rulesUrl: '',
    ...overrides,
  }
}

test('name is required', () => {
  const r = validateTournamentInput(base({ name: '   ' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.name, 'name_required')
})

test('slug auto-derives from the name when left blank', () => {
  const r = validateTournamentInput(base({ name: 'Giải Cầu Lông FKO', slug: '' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.slug, 'giai-cau-long-fko')
})

test('admin-entered slug is normalized (lowercase, url-safe)', () => {
  const r = validateTournamentInput(base({ slug: '  FKO Open!! 2026  ' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.slug, 'fko-open-2026')
})

test('empty name + empty slug reports both name_required and slug_invalid', () => {
  // With no name there is nothing to derive a slug from, so both errors fire.
  const r = validateTournamentInput(base({ name: '  ', slug: '  ' }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.errors.name, 'name_required')
    assert.equal(r.errors.slug, 'slug_invalid')
  }
})

test('a non-latin slug entry still resolves via the name-derived fallback', () => {
  const r = validateTournamentInput(base({ name: 'FKO Cup', slug: '###' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.slug, 'fko-cup')
})

test('ends_at before starts_at is blocked', () => {
  const r = validateTournamentInput(
    base({ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-01T09:00:00.000Z' }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.errors.dates, 'dates_order')
})

test('equal start/end and end-after-start are allowed', () => {
  const eq = validateTournamentInput(
    base({ startsAt: '2026-08-01T09:00:00.000Z', endsAt: '2026-08-01T09:00:00.000Z' }),
  )
  assert.equal(eq.ok, true)
  const after = validateTournamentInput(
    base({ startsAt: '2026-08-01T09:00:00.000Z', endsAt: '2026-08-02T09:00:00.000Z' }),
  )
  assert.equal(after.ok, true)
})

test('invalid rules_url is blocked, valid/bare-domain is normalized', () => {
  const bad = validateTournamentInput(base({ rulesUrl: 'javascript:alert(1)' }))
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.errors.rulesUrl, 'rules_url_invalid')

  const bare = validateTournamentInput(base({ rulesUrl: 'example.com/rules' }))
  assert.equal(bare.ok, true)
  if (bare.ok) assert.equal(bare.value.rulesUrl, 'https://example.com/rules')
})

test('empty optional fields normalize to null', () => {
  const r = validateTournamentInput(base({ location: '   ', rulesUrl: '', startsAt: '', endsAt: '' }))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.startsAt, null)
    assert.equal(r.value.endsAt, null)
    assert.equal(r.value.location, null)
    assert.equal(r.value.rulesUrl, null)
  }
})

test('slugifyTournament falls back to a stable hash for non-latin-only names', () => {
  const s = slugifyTournament('大会')
  assert.match(s, /^giai-[a-z0-9]+$/)
  assert.equal(slugifyTournament('大会'), s) // deterministic
})

test('normalizeSlug and normalizeRulesUrl behave as documented', () => {
  assert.equal(normalizeSlug('Hello World'), 'hello-world')
  assert.equal(normalizeRulesUrl(''), null)
  assert.equal(normalizeRulesUrl('not a url'), null)
  assert.equal(normalizeRulesUrl('https://a.com'), 'https://a.com/')
})
