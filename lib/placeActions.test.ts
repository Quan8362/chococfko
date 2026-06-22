// node --test lib/placeActions.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableActions, directionsUrl, telHref } from './placeActions.ts'

test('availableActions reflects valid targets only', () => {
  const empty = availableActions({})
  assert.equal(empty.call, false)
  assert.equal(empty.reserve, false)
  assert.equal(empty.website, false)
  // always-available
  assert.equal(empty.directions && empty.save && empty.share && empty.ask && empty.report, true)

  const full = availableActions({ phone: '092-1', reservationUrl: 'https://r', officialWebsite: 'https://w', socialUrl: 'https://s' })
  assert.equal(full.call && full.reserve && full.website && full.social, true)
})

test('directionsUrl prefers map_url, then coords, then name search', () => {
  assert.equal(directionsUrl({ mapUrl: 'https://maps/x', name: 'X' }), 'https://maps/x')
  assert.ok(directionsUrl({ mapUrl: '', lat: 33.5, lng: 130.4, name: 'X' }).includes('destination=33.5,130.4'))
  assert.ok(directionsUrl({ mapUrl: '', name: 'Tre Xanh' }).includes('query=Tre%20Xanh%20Japan'))
})

test('telHref uses E.164 then display, null when absent', () => {
  assert.equal(telHref({ phoneE164: '+8192', phone: '092' }), 'tel:+8192')
  assert.equal(telHref({ phone: '092-1' }), 'tel:092-1')
  assert.equal(telHref({}), null)
})
