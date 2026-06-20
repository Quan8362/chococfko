// Framework-free tests for the pure client-error diagnostics helpers.
// Run with:  node --test lib/diagnostics/clientError.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeError,
  isChunkLoadError,
  classifyError,
  genIncidentId,
  buildErrorReport,
  shouldReloadForChunk,
  RELOAD_GUARD_PREFIX,
  type StorageLike,
} from './clientError.ts'

test('normalizeError handles Error, digest, plain object, and primitives', () => {
  const e = new Error('boom')
  ;(e as Error & { digest?: string }).digest = 'abc123'
  const n = normalizeError(e)
  assert.equal(n.name, 'Error')
  assert.equal(n.message, 'boom')
  assert.equal(n.digest, 'abc123')
  assert.equal(typeof n.stack, 'string')

  const fromObj = normalizeError({ name: 'Weird', message: 'x' })
  assert.equal(fromObj.name, 'Weird')
  assert.equal(fromObj.message, 'x')

  const fromStr = normalizeError('just a string')
  assert.equal(fromStr.name, 'Error')
  assert.equal(fromStr.message, 'just a string')

  const fromNull = normalizeError(null)
  assert.equal(fromNull.message, 'null')
})

test('isChunkLoadError matches real stale-build / dynamic-import failures', () => {
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: '' }), true)
  assert.equal(isChunkLoadError({ name: 'Error', message: 'Loading chunk 459 failed.' }), true)
  assert.equal(isChunkLoadError({ name: 'Error', message: 'Loading CSS chunk 12 failed' }), true)
  assert.equal(
    isChunkLoadError({ name: 'TypeError', message: 'Failed to fetch dynamically imported module: https://x/_next/static/chunks/abc.js' }),
    true,
  )
  assert.equal(isChunkLoadError({ name: 'SyntaxError', message: "Unexpected token '<'" }), true)
})

test('isChunkLoadError does NOT match ordinary runtime bugs', () => {
  assert.equal(isChunkLoadError({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'player_x')" }), false)
  assert.equal(isChunkLoadError({ name: 'TypeError', message: 'board.map is not a function' }), false)
  assert.equal(isChunkLoadError({ name: 'Error', message: 'winning_cells is not iterable' }), false)
  assert.equal(classifyError(normalizeError(new TypeError('x is not a function'))), 'runtime')
})

test('genIncidentId is unique-ish, prefixed, and PII-free', () => {
  const a = genIncidentId('CARO')
  const b = genIncidentId('CARO')
  assert.match(a, /^CARO-[A-Z0-9]+-[A-Z0-9]+$/)
  assert.notEqual(a, b)
})

test('buildErrorReport assembles a complete, deterministic report', () => {
  const report = buildErrorReport({
    err: normalizeError(new Error('boom')),
    incidentId: 'CARO-1-ABC',
    route: '/games/caro/JFX3G',
    roomCode: 'JFX3G',
    buildId: 'deadbee',
    online: true,
    channelStatus: 'SUBSCRIBED',
    matchStatus: 'playing',
    loaded: { room: true, player: true, game: true },
    lastRealtimeEvent: 'UPDATE',
    now: 0,
  })
  assert.equal(report.errorClass, 'runtime')
  assert.equal(report.roomCode, 'JFX3G')
  assert.equal(report.matchStatus, 'playing')
  assert.equal(report.channelStatus, 'SUBSCRIBED')
  assert.equal(report.timestamp, '1970-01-01T00:00:00.000Z')
  // No token/email fields are present on the report type at all.
  assert.equal('email' in report, false)
  assert.equal('token' in report, false)
})

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial }
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
  }
}

test('shouldReloadForChunk reloads once for chunk errors then refuses (no loop)', () => {
  const storage = fakeStorage()
  assert.equal(shouldReloadForChunk('chunk', '/games/caro/JFX3G', storage), true)
  assert.ok(storage.store[RELOAD_GUARD_PREFIX + '/games/caro/JFX3G'])
  // Second attempt for the same key → refused.
  assert.equal(shouldReloadForChunk('chunk', '/games/caro/JFX3G', storage), false)
})

test('shouldReloadForChunk never reloads for runtime errors', () => {
  const storage = fakeStorage()
  assert.equal(shouldReloadForChunk('runtime', '/games/caro/JFX3G', storage), false)
  assert.equal(Object.keys(storage.store).length, 0)
})

test('shouldReloadForChunk is safe when storage is unavailable', () => {
  assert.equal(shouldReloadForChunk('chunk', 'k', null), false)
  const throwing: StorageLike = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.equal(shouldReloadForChunk('chunk', 'k', throwing), false)
})
