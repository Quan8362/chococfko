// Pure tests for Explore Phase 1 structured-field helpers.
// Run with:  node --test lib/placeFields.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeUrl,
  isValidHttpUrl,
  normalizePhone,
  isValidCoordinate,
  isInJapanBounds,
  validatePriceRange,
  validateOpeningHours,
  validateJapanesePhrases,
  categoryFieldRelevance,
  placeCompletenessWarnings,
  parseIntOrNull,
  parseTriState,
  parseList,
  parseEnum,
  parseEnumList,
  PARKING_OPTIONS,
  PAYMENT_METHODS,
} from './placeFields.ts'

test('normalizeUrl adds scheme to bare domains and rejects junk', () => {
  assert.equal(normalizeUrl('https://a.com/x'), 'https://a.com/x')
  assert.equal(normalizeUrl('  http://a.com  '), 'http://a.com/')
  assert.equal(normalizeUrl('example.co.jp'), 'https://example.co.jp/')
  assert.equal(normalizeUrl('example.com/path?q=1'), 'https://example.com/path?q=1')
  assert.equal(normalizeUrl(''), null)
  assert.equal(normalizeUrl('not a url'), null)
  assert.equal(normalizeUrl('localhost'), null)        // no dot in host
  assert.equal(normalizeUrl('javascript:alert(1)'), null) // non-http scheme
  assert.equal(normalizeUrl('ftp://a.com'), null)
})

test('isValidHttpUrl mirrors normalizeUrl', () => {
  assert.equal(isValidHttpUrl('https://x.com'), true)
  assert.equal(isValidHttpUrl('nope'), false)
  assert.equal(isValidHttpUrl(null), false)
})

test('normalizePhone preserves display and derives E.164 for Japan', () => {
  assert.deepEqual(normalizePhone('092-123-4567'), { display: '092-123-4567', e164: '+81921234567' })
  assert.deepEqual(normalizePhone('03 1234 5678'), { display: '03 1234 5678', e164: '+81312345678' })
  assert.deepEqual(normalizePhone('+81 90 1234 5678'), { display: '+81 90 1234 5678', e164: '+819012345678' })
  assert.deepEqual(normalizePhone('819012345678'), { display: '819012345678', e164: '+819012345678' })
  assert.deepEqual(normalizePhone(''), { display: null, e164: null })
  // Too short / unrecognized → keep display, no e164
  assert.deepEqual(normalizePhone('1234'), { display: '1234', e164: null })
})

test('isValidCoordinate / isInJapanBounds', () => {
  assert.equal(isValidCoordinate(33.59, 130.4), true)
  assert.equal(isValidCoordinate(91, 0), false)
  assert.equal(isValidCoordinate(0, 181), false)
  assert.equal(isValidCoordinate('33', '130'), false)
  assert.equal(isInJapanBounds(33.59, 130.4), true)   // Fukuoka
  assert.equal(isInJapanBounds(48.8, 2.3), false)      // Paris — valid coord, not Japan
})

test('validatePriceRange catches range + free conflicts', () => {
  assert.equal(validatePriceRange({ priceMin: 1000, priceMax: 3000 }).ok, true)
  assert.equal(validatePriceRange({ priceType: 'paid', priceMin: 500 }).ok, true)
  assert.deepEqual(validatePriceRange({ priceMin: 3000, priceMax: 1000 }).errors, ['price_range_invalid'])
  assert.deepEqual(validatePriceRange({ priceMin: -5 }).errors, ['price_min_invalid'])
  assert.deepEqual(validatePriceRange({ priceType: 'free', priceMin: 500 }).errors, ['price_free_conflict'])
  assert.deepEqual(validatePriceRange({ priceType: 'bogus' }).errors, ['price_type_invalid'])
  assert.equal(validatePriceRange({}).ok, true) // all unknown is fine
})

test('validateOpeningHours validates shape and HH:MM slots', () => {
  assert.deepEqual(validateOpeningHours(null), { ok: true, value: null, errors: [] })
  assert.deepEqual(validateOpeningHours(''), { ok: true, value: null, errors: [] })
  const good = '{"mon":[{"open":"09:00","close":"18:00"}],"sun":[],"notes":"LO 21:00"}'
  const r = validateOpeningHours(good)
  assert.equal(r.ok, true)
  assert.deepEqual(r.value?.sun, [])
  assert.equal(validateOpeningHours('{bad json').ok, false)
  assert.equal(validateOpeningHours('[]').ok, false) // must be object
  assert.deepEqual(validateOpeningHours('{"mon":[{"open":"9","close":"18:00"}]}').errors, ['hours_slot_invalid'])
  assert.deepEqual(validateOpeningHours('{"funday":[]}').errors, ['hours_day_invalid'])
})

test('validateJapanesePhrases normalizes items', () => {
  assert.deepEqual(validateJapanesePhrases(null), { ok: true, value: null, errors: [] })
  const r = validateJapanesePhrases('[{"ja":"いくらですか","romaji":"ikura desu ka","vi":"bao nhiêu tiền"}]')
  assert.equal(r.ok, true)
  assert.equal(r.value?.[0].ja, 'いくらですか')
  assert.equal(validateJapanesePhrases('[{"romaji":"x"}]').ok, false) // ja required
  assert.equal(validateJapanesePhrases('{}').ok, false)               // must be array
})

test('categoryFieldRelevance is category-aware', () => {
  assert.equal(categoryFieldRelevance('onsen').tattoo, true)
  assert.equal(categoryFieldRelevance('food').tattoo, false)
  assert.equal(categoryFieldRelevance('food').reservation, true)
  assert.equal(categoryFieldRelevance('camp').camping, true)
  assert.equal(categoryFieldRelevance('viet').camping, false)
  assert.equal(categoryFieldRelevance('kids_playground').kids, true)
  assert.equal(categoryFieldRelevance('landmark').price, true) // price always relevant
})

test('placeCompletenessWarnings is advisory only', () => {
  // Fully unknown dining place → several warnings, but never throws
  const w = placeCompletenessWarnings({ category: 'food' })
  assert.ok(w.includes('missing_location'))
  assert.ok(w.includes('missing_coordinates'))
  assert.ok(w.includes('missing_hours'))
  assert.ok(w.includes('missing_price'))
  // A well-filled place → no location/price/hours warnings
  const ok = placeCompletenessWarnings({
    category: 'food', lat: 33.59, lng: 130.4, address: 'Hakata',
    openingHours: { mon: [{ open: '09:00', close: '18:00' }] },
    priceType: 'paid', priceMin: 1000,
  })
  assert.equal(ok.includes('missing_location'), false)
  assert.equal(ok.includes('missing_coordinates'), false)
  assert.equal(ok.includes('missing_hours'), false)
  assert.equal(ok.includes('missing_price'), false)
  // Landmark with no hours → no missing_hours (hours less critical there)
  assert.equal(placeCompletenessWarnings({ category: 'park' }).includes('missing_hours'), false)
})

test('form parsers coerce safely', () => {
  assert.equal(parseIntOrNull('15'), 15)
  assert.equal(parseIntOrNull(''), null)
  assert.equal(parseIntOrNull('abc'), null)
  assert.equal(parseTriState('true'), true)
  assert.equal(parseTriState('false'), false)
  assert.equal(parseTriState(''), null)
  assert.deepEqual(parseList('a, b\nc, a'), ['a', 'b', 'c']) // dedup + split
  assert.equal(parseList('   '), null)
  assert.equal(parseEnum('bogus', PARKING_OPTIONS), null)    // not in list
  assert.equal(parseEnum('paid', PARKING_OPTIONS), 'paid')
  assert.deepEqual(parseEnumList(['cash', 'qr', 'bogus'], PAYMENT_METHODS), ['cash', 'qr'])
  assert.equal(parseEnumList(['bogus'], PAYMENT_METHODS), null)
})
