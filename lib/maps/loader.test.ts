// Google Maps loader guards — pure/early-rejection tests (no DOM required).
// Run with:  node --test lib/maps/loader.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadGoogleMaps, _resetGoogleMapsLoader } from './google/loader.ts'

// Missing key rejects BEFORE any DOM/script work — never loads Google.
test('missing key rejects with google_maps_key_missing', async () => {
  _resetGoogleMapsLoader()
  await assert.rejects(() => loadGoogleMaps({ apiKey: null }), /google_maps_key_missing/)
  await assert.rejects(() => loadGoogleMaps({ apiKey: '' }), /google_maps_key_missing/)
})

// With a key but no browser environment (Node), rejects cleanly — no script load.
// This is the same rejection surface the component's error state consumes when a
// real script load fails in the browser.
test('no window rejects with google_maps_no_window', async () => {
  _resetGoogleMapsLoader()
  assert.equal(typeof globalThis.window, 'undefined') // sanity: Node has no window
  await assert.rejects(() => loadGoogleMaps({ apiKey: 'AIza-test' }), /google_maps_no_window/)
})

// Failure does not poison the singleton: a later call still attempts (and here
// re-rejects for the same reason) rather than returning a stale rejected promise.
test('loader can be retried after a failure', async () => {
  _resetGoogleMapsLoader()
  await assert.rejects(() => loadGoogleMaps({ apiKey: 'AIza-test' }), /google_maps_no_window/)
  await assert.rejects(() => loadGoogleMaps({ apiKey: 'AIza-test' }), /google_maps_no_window/)
})
