import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveAnnouncements,
  announceSnapshotsEqual,
  type AnnounceSnapshot,
} from './announce.ts'

function snap(over: Partial<AnnounceSnapshot> = {}): AnnounceSnapshot {
  return {
    handId: 'h1',
    handNo: 1,
    complete: false,
    street: 'PREFLOP',
    levelIndex: 0,
    isMyTurn: false,
    viewerIsWinner: false,
    connUx: 'connected',
    ...over,
  }
}

// ── Structural privacy: the announcement input can carry NO private datum ──────────────────────
test('AnnounceSnapshot exposes only viewer-safe scalar fields (no card/seed/deck)', () => {
  const keys = Object.keys(snap()).sort()
  assert.deepEqual(keys, [
    'complete', 'connUx', 'handId', 'handNo', 'isMyTurn', 'levelIndex', 'street', 'viewerIsWinner',
  ])
  const forbidden = ['card', 'cards', 'hole', 'seed', 'deck', 'shuffle', 'rng', 'password', 'token']
  for (const k of keys) {
    for (const bad of forbidden) assert.ok(!k.toLowerCase().includes(bad), `field ${k} must not resemble ${bad}`)
  }
})

test('no derived event ever serializes a card/seed/hidden token', () => {
  const events = deriveAnnouncements(snap({ isMyTurn: false }), snap({ handId: 'h2', handNo: 2, isMyTurn: true, levelIndex: 1, complete: false, street: 'FLOP' }))
  const json = JSON.stringify(events).toLowerCase()
  for (const bad of ['seed', 'deck', 'hole', 'shuffle', 'password', 'token', 'eyj']) {
    assert.ok(!json.includes(bad), `events must not contain "${bad}"`)
  }
})

// ── Quiet-on-load: the first snapshot replays no table history ─────────────────────────────────
test('first snapshot (prev=null) announces nothing except an active own turn', () => {
  assert.deepEqual(deriveAnnouncements(null, snap({ handNo: 5, levelIndex: 3, street: 'RIVER' })), [])
  const withTurn = deriveAnnouncements(null, snap({ isMyTurn: true }))
  assert.equal(withTurn.length, 1)
  assert.equal(withTurn[0].type, 'your_turn')
  assert.equal(withTurn[0].priority, 'assertive')
})

// ── Transitions ───────────────────────────────────────────────────────────────────────────────
test('blind level up is announced (polite)', () => {
  const ev = deriveAnnouncements(snap({ levelIndex: 0 }), snap({ levelIndex: 1 }))
  const bl = ev.find((e) => e.type === 'blind_level')
  assert.ok(bl && bl.type === 'blind_level' && bl.level === 2 && bl.priority === 'polite')
})

test('a new live hand is announced with its hand number', () => {
  const ev = deriveAnnouncements(snap({ handId: 'h1', complete: true }), snap({ handId: 'h2', handNo: 2, complete: false }))
  const hs = ev.find((e) => e.type === 'hand_start')
  assert.ok(hs && hs.type === 'hand_start' && hs.handNo === 2)
})

test('a new street in the same hand is announced', () => {
  const ev = deriveAnnouncements(snap({ street: 'PREFLOP' }), snap({ street: 'FLOP' }))
  const st = ev.find((e) => e.type === 'street')
  assert.ok(st && st.type === 'street' && st.street === 'FLOP')
})

test('street is NOT announced across different hands (that is hand_start)', () => {
  const ev = deriveAnnouncements(snap({ handId: 'h1', street: 'RIVER' }), snap({ handId: 'h2', handNo: 2, street: 'PREFLOP' }))
  assert.equal(ev.find((e) => e.type === 'street'), undefined)
})

test('hand completion is announced with win/loss for the viewer', () => {
  const lost = deriveAnnouncements(snap({ complete: false }), snap({ complete: true, viewerIsWinner: false }))
  const l = lost.find((e) => e.type === 'hand_complete')
  assert.ok(l && l.type === 'hand_complete' && l.won === false)
  const won = deriveAnnouncements(snap({ complete: false }), snap({ complete: true, viewerIsWinner: true }))
  const w = won.find((e) => e.type === 'hand_complete')
  assert.ok(w && w.type === 'hand_complete' && w.won === true)
})

test('gaining the turn is assertive; keeping it does not re-announce', () => {
  const gained = deriveAnnouncements(snap({ isMyTurn: false }), snap({ isMyTurn: true }))
  assert.ok(gained.some((e) => e.type === 'your_turn' && e.priority === 'assertive'))
  const kept = deriveAnnouncements(snap({ isMyTurn: true }), snap({ isMyTurn: true }))
  assert.equal(kept.find((e) => e.type === 'your_turn'), undefined)
})

test('connection transitions: offline (assertive), reconnecting, reconnected', () => {
  const off = deriveAnnouncements(snap({ connUx: 'connected' }), snap({ connUx: 'offline' }))
  assert.ok(off.some((e) => e.type === 'conn' && e.state === 'offline' && e.priority === 'assertive'))
  const recon = deriveAnnouncements(snap({ connUx: 'connected' }), snap({ connUx: 'reconnecting' }))
  assert.ok(recon.some((e) => e.type === 'conn' && e.state === 'reconnecting'))
  const back = deriveAnnouncements(snap({ connUx: 'reconnecting' }), snap({ connUx: 'connected' }))
  assert.ok(back.some((e) => e.type === 'conn' && e.state === 'reconnected'))
})

test('the ordinary first connecting→connected is NOT announced as a reconnect', () => {
  const ev = deriveAnnouncements(snap({ connUx: 'connecting' }), snap({ connUx: 'connected' }))
  assert.equal(ev.find((e) => e.type === 'conn'), undefined)
})

// ── Dedup: identical / duplicated realtime snapshots derive nothing ────────────────────────────
test('identical snapshots are equal and derive no events', () => {
  const a = snap({ handNo: 3, street: 'TURN' })
  const b = snap({ handNo: 3, street: 'TURN' })
  assert.equal(announceSnapshotsEqual(a, b), true)
  assert.deepEqual(deriveAnnouncements(a, b), [])
})

test('announceSnapshotsEqual detects any tracked change', () => {
  const base = snap()
  assert.equal(announceSnapshotsEqual(base, snap({ isMyTurn: true })), false)
  assert.equal(announceSnapshotsEqual(base, snap({ street: 'FLOP' })), false)
  assert.equal(announceSnapshotsEqual(base, snap({ connUx: 'offline' })), false)
  assert.equal(announceSnapshotsEqual(null, base), false)
  assert.equal(announceSnapshotsEqual(base, base), true)
})
