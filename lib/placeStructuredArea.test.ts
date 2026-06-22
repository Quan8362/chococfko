// Regression tests for the structured-area round trip on the admin place editor.
//
// Bug fixed: the four structured-area fields (area_main / city_or_prefecture /
// nearby_place / relation_type) appeared empty when the admin re-opened the edit
// page after saving. Root cause was a stale App Router client cache (updatePlace
// did not revalidate `/admin/places/[slug]`), NOT data loss — the DB always kept
// the values. These tests lock in the data round trip and the non-clobber rules.
//
// Run with:  node --test lib/placeStructuredArea.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStructuredArea, neutralAreaString, formatArea, RELATION_TYPES } from './places.ts'

// ── Test doubles ──────────────────────────────────────────────────────────────

// A places row as stored in the DB (only the columns under test).
interface Row {
  slug: string
  name: string
  area: string | null
  area_main: string | null
  nearby_place: string | null
  city_or_prefecture: string | null
  relation_type: string | null
  prefecture: string | null
  city: string | null
}

// Build a FormData like the edit form submits. Omitting a key models a field that
// was not mounted / not submitted.
function form(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.set(k, v)
  return fd
}

// Mirror of updatePlace's structured-area write: only touch the area columns when
// the fieldset was actually submitted (formData has `area_main`).
function applySave(row: Row, fd: FormData): Row {
  const next = { ...row }
  if (fd.has('name')) next.name = (fd.get('name') as string).trim()
  if (fd.has('prefecture')) next.prefecture = (fd.get('prefecture') as string) || null
  if (fd.has('city')) next.city = (fd.get('city') as string)?.trim() || null
  if (fd.has('area_main')) Object.assign(next, parseStructuredArea(fd))
  return next
}

// Mirror of the edit page's initial values (page.tsx): raw snake_case row →
// defaultValue, with the same fallbacks the inputs use.
function editInitialValues(row: Row) {
  return {
    area_main: row.area_main ?? '',
    city_or_prefecture: row.city_or_prefecture ?? '',
    nearby_place: row.nearby_place ?? '',
    relation_type: row.relation_type ?? 'near',
    prefecture: row.prefecture ?? 'fukuoka',
    city: row.city ?? '',
  }
}

function baseRow(over: Partial<Row> = {}): Row {
  return {
    slug: 'dazaifu-tenmangu', name: 'Dazaifu Tenmangu',
    area: 'Dazaifu', area_main: null, nearby_place: null,
    city_or_prefecture: null, relation_type: null,
    prefecture: 'fukuoka', city: 'Dazaifu', ...over,
  }
}

// ── parseStructuredArea (the save shape) ────────────────────────────────────────

test('parseStructuredArea maps all four fields and builds neutral area', () => {
  const cols = parseStructuredArea(form({
    area_main: 'Dazaifu', nearby_place: '太宰府駅',
    city_or_prefecture: 'Fukuoka', relation_type: 'in',
  }))
  assert.equal(cols.area_main, 'Dazaifu')
  assert.equal(cols.nearby_place, '太宰府駅')
  assert.equal(cols.city_or_prefecture, 'Fukuoka')
  assert.equal(cols.relation_type, 'in')
  assert.equal(cols.area, 'Dazaifu, 太宰府駅, Fukuoka')
})

test('parseStructuredArea trims and nulls empty optionals', () => {
  const cols = parseStructuredArea(form({
    area_main: '  Sasaguri  ', nearby_place: '   ',
    city_or_prefecture: '', relation_type: 'near',
  }))
  assert.equal(cols.area_main, 'Sasaguri')
  assert.equal(cols.nearby_place, null)
  assert.equal(cols.city_or_prefecture, null)
  assert.equal(cols.area, 'Sasaguri')
})

test('relation_type defaults to "near" only when missing/invalid', () => {
  assert.equal(parseStructuredArea(form({ area_main: 'X' })).relation_type, 'near')
  assert.equal(parseStructuredArea(form({ area_main: 'X', relation_type: 'bogus' })).relation_type, 'near')
  for (const r of RELATION_TYPES) {
    assert.equal(parseStructuredArea(form({ area_main: 'X', relation_type: r })).relation_type, r)
  }
})

// ── Round trip: save → reload → identical (req #10) ─────────────────────────────

test('save all four fields, reload the same place, values remain identical', () => {
  let row = baseRow()
  const submitted = {
    area_main: 'Dazaifu', nearby_place: '太宰府駅',
    city_or_prefecture: 'Fukuoka', relation_type: 'near',
  }
  row = applySave(row, form({ name: 'Dazaifu Tenmangu', ...submitted }))

  // DB now holds the values (this is what the production read confirmed).
  assert.equal(row.area_main, 'Dazaifu')
  assert.equal(row.nearby_place, '太宰府駅')
  assert.equal(row.city_or_prefecture, 'Fukuoka')
  assert.equal(row.relation_type, 'near')

  // Reopening the editor hydrates the same values (no empties).
  const initial = editInitialValues(row)
  assert.equal(initial.area_main, 'Dazaifu')
  assert.equal(initial.city_or_prefecture, 'Fukuoka')
  assert.equal(initial.nearby_place, '太宰府駅')
  assert.equal(initial.relation_type, 'near')
})

test('editing an unrelated field leaves the structured-area columns unchanged', () => {
  const saved = applySave(baseRow(), form({
    name: 'Dazaifu Tenmangu', area_main: 'Dazaifu',
    nearby_place: '太宰府駅', city_or_prefecture: 'Fukuoka', relation_type: 'near',
  }))

  // A later submit that changes only the name and does NOT carry the area fieldset
  // (no `area_main` key) must not wipe the saved location values.
  const after = applySave(saved, form({ name: 'Dazaifu Tenmangu (updated)' }))
  assert.equal(after.name, 'Dazaifu Tenmangu (updated)')
  assert.equal(after.area_main, 'Dazaifu')
  assert.equal(after.nearby_place, '太宰府駅')
  assert.equal(after.city_or_prefecture, 'Fukuoka')
  assert.equal(after.relation_type, 'near')
})

test('editing prefecture/city does not touch structured-area columns', () => {
  const saved = applySave(baseRow(), form({
    name: 'X', area_main: 'Dazaifu', city_or_prefecture: 'Fukuoka', relation_type: 'in',
  }))
  const after = applySave(saved, form({ name: 'X', prefecture: 'osaka', city: 'Namba' }))
  assert.equal(after.prefecture, 'osaka')
  assert.equal(after.city, 'Namba')
  // structured area untouched (distinct from prefecture/city)
  assert.equal(after.area_main, 'Dazaifu')
  assert.equal(after.city_or_prefecture, 'Fukuoka')
  assert.equal(after.relation_type, 'in')
})

test('empty optional nearby landmark saves as null but keeps area_main', () => {
  const saved = applySave(baseRow(), form({
    name: 'X', area_main: 'Sasaguri', nearby_place: '', city_or_prefecture: 'Fukuoka', relation_type: 'near',
  }))
  assert.equal(saved.area_main, 'Sasaguri')
  assert.equal(saved.nearby_place, null)
  assert.equal(saved.city_or_prefecture, 'Fukuoka')

  // Reopen: optional empty renders as '', required area_main keeps its value.
  const initial = editInitialValues(saved)
  assert.equal(initial.area_main, 'Sasaguri')
  assert.equal(initial.nearby_place, '')
})

// ── Legacy rows with NULL structured-area columns (req #10) ─────────────────────

test('legacy row with NULL structured fields hydrates to safe editor defaults', () => {
  const legacy = baseRow({ area: 'Dazaifu', area_main: null, relation_type: null })
  const initial = editInitialValues(legacy)
  assert.equal(initial.area_main, '')           // empty, ready to fill
  assert.equal(initial.city_or_prefecture, '')
  assert.equal(initial.nearby_place, '')
  assert.equal(initial.relation_type, 'near')   // default for a record with no value
})

test('formatArea falls back to legacy `area` text when area_main is null', () => {
  const t = (key: string) => key // identity translator
  const legacy = { area: 'Dazaifu', areaMain: null, nearbyPlace: null, cityOrPrefecture: null, relationType: null }
  assert.equal(formatArea(legacy, t), 'Dazaifu')
})

test('neutralAreaString joins only present parts', () => {
  assert.equal(neutralAreaString({ areaMain: 'A', nearbyPlace: null, cityOrPrefecture: 'C' }), 'A, C')
  assert.equal(neutralAreaString({ areaMain: 'A' }), 'A')
  assert.equal(neutralAreaString({}), '')
})

// Sanity: a "switch slugs" navigation is handled by remounting the form
// (key={slug} in page.tsx). At the data layer each slug parses independently —
// no shared mutable state leaks between two different submissions.
test('two different places parse independently (no cross-slug bleed)', () => {
  const a = parseStructuredArea(form({ area_main: 'Dazaifu', relation_type: 'near' }))
  const b = parseStructuredArea(form({ area_main: 'Itoshima', relation_type: 'suburb' }))
  assert.equal(a.area_main, 'Dazaifu')
  assert.equal(b.area_main, 'Itoshima')
  assert.equal(a.relation_type, 'near')
  assert.equal(b.relation_type, 'suburb')
})
