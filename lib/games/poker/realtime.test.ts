// Concurrency & realtime-reconciliation tests for the pure Poker sync engine.
// Run with:  node --test lib/games/poker/realtime.test.ts
//
// These exercise the CLIENT-side guarantees the realtime model demands (realtime-model §2/§6,
// security-model D4/EC-I*): stale drop, duplicate suppression, out-of-order rejection, gap →
// snapshot reconcile, recipient-aware privacy, animation-safe recovery, connection-state gating,
// and presentation-only timers. Server-side atomicity (the CAS expected-seq winner, settlement
// idempotency) is covered by the P3 DB harness (poker_db_tests / E1–E8); each such scenario is
// asserted here from the client's perspective and cross-referenced in a comment.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PokerSyncController,
  assertSnapshotPrivacy,
  deriveConnUx,
  canSubmitAction,
  turnSecondsLeft,
  shouldNudgeTimeout,
  totalPot,
  type PokerSnapshot,
  type PokerLegalView,
} from './realtime.ts'
import type { PublicTableState, PublicSeat, MyHoleCardsState, Card } from './types.ts'

// ── Builders ─────────────────────────────────────────────────────────────────────────
function seat(over: Partial<PublicSeat> & { seatIndex: number }): PublicSeat {
  return {
    seatIndex: over.seatIndex,
    userId: over.userId ?? `u${over.seatIndex}`,
    displayName: over.displayName ?? `P${over.seatIndex}`,
    avatarUrl: over.avatarUrl ?? null,
    stack: over.stack ?? 1000,
    committedThisStreet: over.committedThisStreet ?? 0,
    lastAction: over.lastAction ?? null,
    allIn: over.allIn ?? false,
    status: over.status ?? 'sitting_in',
    connected: over.connected ?? true,
  }
}

function publicState(over: Partial<PublicTableState> & { stateVersion: number }): PublicTableState {
  return {
    tableId: over.tableId ?? 'table-1',
    handId: over.handId ?? 'hand-1',
    handNo: over.handNo ?? 1,
    stateVersion: over.stateVersion,
    phase: over.phase ?? 'BETTING',
    street: over.street ?? 'PREFLOP',
    board: over.board ?? [],
    pots: over.pots ?? { main: { amount: 30, eligibleSeatIndexes: [0, 1] }, sides: [] },
    seats: over.seats ?? [seat({ seatIndex: 0 }), seat({ seatIndex: 1 })],
    buttonSeat: over.buttonSeat ?? 0,
    turnSeat: over.turnSeat ?? 0,
    turnDeadline: over.turnDeadline ?? null,
    turnStartedAt: over.turnStartedAt ?? null,
    reveal: over.reveal,
  }
}

function snapshot(over: Partial<PokerSnapshot> & { public: PublicTableState }): PokerSnapshot {
  return {
    public: over.public,
    viewerSeatIndex: 'viewerSeatIndex' in over ? (over.viewerSeatIndex as number | null) : 0,
    ownHole: over.ownHole ?? null,
    legal: over.legal ?? null,
    serverTs: over.serverTs ?? Date.now(),
  }
}

const HOLE = (handId: string, seatIndex: number): MyHoleCardsState => ({
  handId,
  seatIndex,
  cards: ['As', 'Kd'] as const,
})

const LEGAL = (seatIndex: number, version: number): PokerLegalView => ({
  model: {
    seatIndex,
    allowed: ['fold', 'call', 'raise'],
    callAmount: 20,
    minOpeningBet: 0,
    minRaiseTo: 40,
    maxRaiseTo: 1000,
    currentStreetContribution: 0,
    totalContribution: 0,
    remainingStack: 1000,
    pot: 30,
    street: 'PREFLOP',
    actionSeq: version,
  },
  turnSeat: seatIndex,
  turnDeadline: Date.now() + 20000,
  timeBankSeconds: 15,
  stateVersion: version,
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Event ordering: stale / duplicate / out-of-order / gap (realtime-model §2)
// ══════════════════════════════════════════════════════════════════════════════════════

test('initial event always reconciles (nothing applied yet)', () => {
  const c = new PokerSyncController()
  assert.deepEqual(c.ingestEvent({ stateVersion: 5 }), { decision: 'reconcile', reason: 'forward' })
})

test('duplicate event (same version) is dropped — idempotent (D4/EC-I2)', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5 }) }))
  assert.deepEqual(c.ingestEvent({ stateVersion: 5 }), { decision: 'drop', reason: 'duplicate' })
})

test('out-of-order / old delayed event (older version) is dropped — stale', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 8 }) }))
  assert.deepEqual(c.ingestEvent({ stateVersion: 3 }), { decision: 'drop', reason: 'stale' })
})

test('contiguous forward event reconciles, labelled forward', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5 }) }))
  assert.deepEqual(c.ingestEvent({ stateVersion: 6 }), { decision: 'reconcile', reason: 'forward' })
})

test('missing event (version gap) reconciles, labelled gap — never a partial jump', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5 }) }))
  // Versions 6,7 were missed; 8 arrives. We must NOT apply a partial jump — reconcile to truth.
  assert.deepEqual(c.ingestEvent({ stateVersion: 8 }), { decision: 'reconcile', reason: 'gap' })
})

test('malformed event version is dropped', () => {
  const c = new PokerSyncController()
  assert.deepEqual(c.ingestEvent({ stateVersion: -1 }), { decision: 'drop', reason: 'invalid' })
  assert.deepEqual(c.ingestEvent({ stateVersion: 1.5 }), { decision: 'drop', reason: 'invalid' })
})

test('stable eventId dedupe catches a doubled delivery before the version check', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5 }) }))
  assert.equal(c.ingestEvent({ stateVersion: 6, eventId: 'evt-a' }).decision, 'reconcile')
  // Same id replayed (reconnect replay / doubled socket delivery) → dropped as duplicate.
  assert.deepEqual(c.ingestEvent({ stateVersion: 6, eventId: 'evt-a' }), { decision: 'drop', reason: 'duplicate' })
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Snapshot application: monotonic guard, contiguity, animation-safety (realtime-model §6)
// ══════════════════════════════════════════════════════════════════════════════════════

test('a stale snapshot can never regress newer applied state', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 10 }) }))
  const r = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 7 }) }))
  assert.equal(r.applied, false)
  assert.equal(r.reason, 'stale')
  assert.equal(c.version, 10)
})

test('equal-version snapshot is re-adopted (trusted refetch repairs local copy)', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 4 }) }))
  const r = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 4, turnSeat: 1 }) }))
  assert.equal(r.applied, true)
  assert.equal(c.publicState?.turnSeat, 1)
})

test('contiguous same-hand apply emits presentation cues (animate)', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5, board: [], street: 'PREFLOP' }) }))
  const flop: Card[] = ['2c', '7d', 'Jh']
  const r = c.applySnapshot(snapshot({
    public: publicState({ stateVersion: 6, board: flop, street: 'FLOP', pots: { main: { amount: 60, eligibleSeatIndexes: [0, 1] }, sides: [] } }),
  }))
  assert.equal(r.applied, true)
  assert.equal(r.contiguous, true)
  assert.ok(r.cues)
  assert.deepEqual(r.cues?.newBoardCards, flop)
  assert.equal(r.cues?.streetChanged, true)
  assert.equal(r.cues?.potIncreased, true)
})

test('non-contiguous (gap) apply SNAPS with no cues — no replayed animation after recovery (EC-I5)', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5, board: [] }) }))
  // Jump straight to the river (missed turn/flop events). The UI must snap, not replay.
  const r = c.applySnapshot(snapshot({
    public: publicState({ stateVersion: 12, board: ['2c', '7d', 'Jh', 'Qs', '4h'], street: 'RIVER' }),
  }))
  assert.equal(r.applied, true)
  assert.equal(r.contiguous, false)
  assert.equal(r.cues, null)
  assert.equal(c.publicState?.street, 'RIVER')
})

test('acting-seat cue is derived from the seat whose lastAction changed', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5, seats: [seat({ seatIndex: 0 }), seat({ seatIndex: 1 })] }) }))
  const r = c.applySnapshot(snapshot({
    public: publicState({
      stateVersion: 6,
      turnSeat: 1,
      seats: [seat({ seatIndex: 0, lastAction: 'raise', committedThisStreet: 40 }), seat({ seatIndex: 1 })],
    }),
  }))
  assert.deepEqual(r.cues?.actingSeat, { seatIndex: 0, action: 'raise' })
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Refresh / reconnect / background-resume — all the same snapshot path
// ══════════════════════════════════════════════════════════════════════════════════════

test('refresh on the flop: a cold controller adopts mid-hand state without animation', () => {
  const c = new PokerSyncController() // fresh load, like a page refresh
  const r = c.applySnapshot(snapshot({
    public: publicState({ stateVersion: 7, board: ['2c', '7d', 'Jh'], street: 'FLOP' }),
    ownHole: HOLE('hand-1', 0),
  }))
  assert.equal(r.applied, true)
  assert.equal(r.contiguous, false) // first apply ⇒ snap, never animate the whole history
  assert.equal(r.cues, null)
  assert.deepEqual(c.publicState?.board, ['2c', '7d', 'Jh'])
  assert.deepEqual(c.ownHole?.cards, ['As', 'Kd'])
})

test('refresh during showdown: adopts reveal + settlement without firing a stale settled cue', () => {
  const c = new PokerSyncController()
  const r = c.applySnapshot(snapshot({
    public: publicState({
      stateVersion: 20, phase: 'SETTLEMENT', street: 'SHOWDOWN',
      board: ['2c', '7d', 'Jh', 'Qs', '4h'],
      reveal: [{ seatIndex: 0, cards: ['As', 'Kd'] }],
    }),
  }))
  assert.equal(r.applied, true)
  assert.equal(r.cues, null) // first apply ⇒ no animation replay
  assert.equal(c.publicState?.reveal?.length, 1)
})

test('background-tab resume after missed events: reconcile snapshot wins, no partial state', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 3, street: 'PREFLOP' }) }))
  // While backgrounded, versions 4..15 happened. visibilitychange → snapshot fetch returns 15.
  assert.equal(c.ingestEvent({ stateVersion: 15 }).reason, 'gap')
  const r = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 15, street: 'RIVER' }) }))
  assert.equal(r.applied, true)
  assert.equal(c.version, 15)
  assert.equal(c.publicState?.street, 'RIVER')
})

test('reconnecting client: a replayed OLD snapshot is ignored (no regression)', () => {
  // Mirrors the server rejecting a stale resent action (expected-seq CAS, EC-H2): even if a
  // reconnect path delivers an old snapshot, the controller refuses to move backwards.
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 30 }) }))
  const r = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 22 }) }))
  assert.equal(r.applied, false)
  assert.equal(c.version, 30)
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Own hole cards — recipient-scoped, hand-keyed (security §2, realtime §6)
// ══════════════════════════════════════════════════════════════════════════════════════

test('new hand discards the previous hand’s own cards', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5, handId: 'hand-1' }), ownHole: HOLE('hand-1', 0) }))
  assert.ok(c.ownHole)
  // A new hand begins (different handId) and the snapshot has not yet carried the new cards.
  const r = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 6, handId: 'hand-2' }), ownHole: null }))
  assert.equal(r.newHand, true)
  assert.equal(c.ownHole, null) // old cards gone, new not yet fetched
})

test('setOwnHole accepts only the current hand and the viewer’s own seat', () => {
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 5, handId: 'hand-2' }), viewerSeatIndex: 0 }))
  assert.equal(c.setOwnHole(HOLE('hand-9', 0)), false) // wrong hand
  assert.equal(c.setOwnHole(HOLE('hand-2', 1)), false) // not our seat
  assert.equal(c.setOwnHole(HOLE('hand-2', 0)), true)
  assert.deepEqual(c.ownHole?.cards, ['As', 'Kd'])
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Spectator — public information only (security §2, SPECTATOR PAYLOAD)
// ══════════════════════════════════════════════════════════════════════════════════════

test('spectator joining an active hand receives no cards and no legal model', () => {
  const c = new PokerSyncController()
  const r = c.applySnapshot(snapshot({
    public: publicState({ stateVersion: 9, board: ['2c', '7d', 'Jh'], street: 'FLOP' }),
    viewerSeatIndex: null,
    ownHole: null,
    legal: null,
  }))
  assert.equal(r.applied, true)
  assert.equal(c.viewerSeatIndex, null)
  assert.equal(c.ownHole, null)
  assert.equal(c.legal, null)
  // The spectator still sees the public board (revealed streets only).
  assert.deepEqual(c.publicState?.board, ['2c', '7d', 'Jh'])
})

test('assertSnapshotPrivacy throws if a spectator snapshot carries private state', () => {
  assert.throws(() => assertSnapshotPrivacy(snapshot({
    public: publicState({ stateVersion: 1 }), viewerSeatIndex: null, ownHole: HOLE('hand-1', 0),
  })), /spectator received own hole cards/)
})

test('assertSnapshotPrivacy throws on foreign own-card seat / foreign legal seat', () => {
  assert.throws(() => assertSnapshotPrivacy(snapshot({
    public: publicState({ stateVersion: 1 }), viewerSeatIndex: 0, ownHole: HOLE('hand-1', 1),
  })), /ownHole seat does not match/)
  assert.throws(() => assertSnapshotPrivacy(snapshot({
    public: publicState({ stateVersion: 1 }), viewerSeatIndex: 0, legal: LEGAL(3, 1),
  })), /legal-action model targets a foreign seat/)
})

test('applySnapshot rejects (never applies) a privacy-violating snapshot', () => {
  const c = new PokerSyncController()
  const bad = snapshot({ public: publicState({ stateVersion: 1 }), viewerSeatIndex: 0, ownHole: HOLE('hand-1', 2) })
  const r = c.applySnapshot(bad)
  assert.equal(r.applied, false)
  assert.equal(r.reason, 'rejected_privacy')
  assert.equal(c.hasState, false)
})

test('assertSnapshotPrivacy catches a forbidden private key smuggled into the public payload', () => {
  const leaky = {
    ...publicState({ stateVersion: 1 }),
    seats: [{ ...seat({ seatIndex: 0 }), hole_cards: ['As', 'Kd'] }],
  } as unknown as PublicTableState
  assert.throws(() => assertSnapshotPrivacy(snapshot({ public: leaky })), /forbidden private field/)
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Settlement-twice & double-action — client view of server idempotency
// ══════════════════════════════════════════════════════════════════════════════════════

test('settled cue fires once on the BETTING→COMPLETED edge, not on a re-applied COMPLETED', () => {
  // Server settlement is idempotent (poker_settle_hand). If a duplicate settlement bumps the
  // version, the client adopts it but must not re-fire the "settled" celebration.
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 18, phase: 'BETTING' }) }))
  const first = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 19, phase: 'COMPLETED' }) }))
  assert.equal(first.cues?.settled, true)
  const second = c.applySnapshot(snapshot({ public: publicState({ stateVersion: 20, phase: 'COMPLETED' }) }))
  assert.equal(second.cues?.settled, false) // already COMPLETED ⇒ no second celebration
})

test('double-click raise: the second event is a duplicate version and drops', () => {
  // The server dedupes the action via its idempotency key; the realtime echo of the single
  // accepted transition arrives once per version. A doubled echo is a duplicate-version drop.
  const c = new PokerSyncController()
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 6 }) }))
  assert.equal(c.ingestEvent({ stateVersion: 7 }).decision, 'reconcile')
  c.applySnapshot(snapshot({ public: publicState({ stateVersion: 7 }) }))
  assert.equal(c.ingestEvent({ stateVersion: 7 }).decision, 'drop')
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Connection-state UX gating (realtime-model §4)
// ══════════════════════════════════════════════════════════════════════════════════════

test('deriveConnUx maps transport + network + sync health', () => {
  const base = { online: true, transport: 'connected' as const, syncFailing: false, reconciledOnce: true }
  assert.equal(deriveConnUx(base), 'connected')
  assert.equal(deriveConnUx({ ...base, online: false }), 'offline')
  assert.equal(deriveConnUx({ ...base, reconciledOnce: false }), 'connecting')
  assert.equal(deriveConnUx({ ...base, transport: 'connecting' }), 'connecting')
  assert.equal(deriveConnUx({ ...base, transport: 'reconnecting' }), 'reconnecting')
  assert.equal(deriveConnUx({ ...base, transport: 'closed' }), 'reconnecting')
  assert.equal(deriveConnUx({ ...base, syncFailing: true }), 'degraded')
})

test('canSubmitAction is true ONLY when fully connected & reconciled', () => {
  assert.equal(canSubmitAction('connected'), true)
  for (const s of ['connecting', 'reconnecting', 'degraded', 'offline'] as const) {
    assert.equal(canSubmitAction(s), false)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════
// Turn clock — presentation only; server owns expiry (realtime-model §7)
// ══════════════════════════════════════════════════════════════════════════════════════

test('turnSecondsLeft counts down to 0 and is capped, never enforcing expiry', () => {
  const now = 1_000_000
  assert.equal(turnSecondsLeft(now + 20000, now, 20), 20)
  assert.equal(turnSecondsLeft(now + 9400, now, 20), 10)
  assert.equal(turnSecondsLeft(now - 5000, now, 20), 0) // past deadline ⇒ 0 (display only)
  assert.equal(turnSecondsLeft(null, now, 20), 20) // no live deadline ⇒ full cap
  assert.equal(turnSecondsLeft(now + 999000, now, 20), 20) // capped
})

test('shouldNudgeTimeout fires only after deadline + grace (background throttle cannot extend it)', () => {
  const now = 1_000_000
  assert.equal(shouldNudgeTimeout(now + 1000, now, 2500), false) // before deadline
  assert.equal(shouldNudgeTimeout(now - 1000, now, 2500), false) // past deadline, within grace
  assert.equal(shouldNudgeTimeout(now - 3000, now, 2500), true) // past deadline + grace
  assert.equal(shouldNudgeTimeout(null, now, 2500), false)
})

test('totalPot sums main and side pots (integer coins)', () => {
  const s = publicState({
    stateVersion: 1,
    pots: { main: { amount: 100, eligibleSeatIndexes: [0, 1, 2] }, sides: [{ amount: 40, eligibleSeatIndexes: [0, 1] }, { amount: 10, eligibleSeatIndexes: [0] }] },
  })
  assert.equal(totalPot(s), 150)
})
