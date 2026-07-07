import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTournamentTableView, toAppliedAction, assertTournamentViewPrivacy,
  type BuildTableViewInput, type RawSeatRow, type TournamentTableView,
} from './tableView.ts'
import {
  liveView, applyAction, holeCardsForSeat,
  type TournamentHandConfig, type LoggedAction,
} from './handRunner.ts'
import type { AppliedAction } from '../betting.ts'

function handConfig(seatCount: number, seed = 4242): TournamentHandConfig {
  return {
    seed, handNo: 3, bigBlind: 100, smallBlind: 50, buttonSeat: 0,
    seats: Array.from({ length: seatCount }, (_, i) => ({ seatIndex: i, stack: 6000 })),
  }
}

function rawSeats(seatCount: number): RawSeatRow[] {
  return Array.from({ length: seatCount }, (_, i) => ({
    seatIndex: i, userId: `user-${i}`, displayName: `Player ${i}`, avatarUrl: null, stack: 6000, state: 'active',
  }))
}

function baseInput(overrides: Partial<BuildTableViewInput> = {}): BuildTableViewInput {
  return {
    meta: { tournamentId: 't1', title: 'Test Cup', state: 'RUNNING', levelIndex: 0, smallBlind: 50, bigBlind: 100, ante: 0 },
    seats: rawSeats(3),
    tableNo: 1,
    viewerSeatIndex: 1,
    participantState: 'seated',
    hand: { handId: 'h1', config: handConfig(3), log: [] },
    ...overrides,
  }
}

test('TV-001 own cards present, ALL opponent cards absent (private-state isolation)', () => {
  const config = handConfig(3)
  const view = buildTournamentTableView(baseInput({ hand: { handId: 'h1', config, log: [] } }))
  const own = holeCardsForSeat(config, 1) // Card is a `${Rank}${Suit}` string
  const self = view.seats.find((s) => s.seatIndex === 1)!
  assert.ok(self.cards, 'viewer must receive own cards')
  assert.deepEqual(self.cards, own)
  // Every non-self seat must have null cards…
  for (const s of view.seats) if (s.seatIndex !== 1) assert.equal(s.cards, null, `seat ${s.seatIndex} leaked cards`)
  // …and neither opponent's exact two-card pair may appear ANYWHERE in the serialized view.
  const blob = JSON.stringify(view)
  for (const seat of [0, 2]) {
    const [c1, c2] = holeCardsForSeat(config, seat)
    assert.ok(!blob.includes(`["${c1}","${c2}"]`), `opponent seat ${seat} card pair leaked`)
  }
})

test('TV-002 legal model ONLY on the viewer\'s turn', () => {
  const config = handConfig(2)
  // Preflop, someone is to act. Build for the seat that is NOT on turn → legal must be null.
  const v0 = liveView(config, [])
  const turn = v0.turnSeat!
  const other = config.seats.find((s) => s.seatIndex !== turn)!.seatIndex
  const asOther = buildTournamentTableView(baseInput({ seats: rawSeats(2), viewerSeatIndex: other, hand: { handId: 'h', config, log: [] } }))
  assert.equal(asOther.isMyTurn, false)
  assert.equal(asOther.legal, null, 'off-turn viewer must not receive a legal model')
  const asTurn = buildTournamentTableView(baseInput({ seats: rawSeats(2), viewerSeatIndex: turn, hand: { handId: 'h', config, log: [] } }))
  assert.equal(asTurn.isMyTurn, true)
  assert.ok(asTurn.legal && asTurn.legal.seatIndex === turn, 'on-turn viewer receives their own legal model')
})

test('TV-003 spectator/non-seated viewer never receives any cards or legal model', () => {
  const config = handConfig(3)
  const view = buildTournamentTableView(baseInput({ viewerSeatIndex: null, participantState: 'eliminated', hand: { handId: 'h', config, log: [] } }))
  for (const s of view.seats) assert.equal(s.cards, null)
  assert.equal(view.legal, null)
  assert.equal(view.isMyTurn, false)
})

test('TV-004 board only carries revealed community cards (never the full deck)', () => {
  const config = handConfig(2)
  const view = buildTournamentTableView(baseInput({ seats: rawSeats(2), hand: { handId: 'h', config, log: [] } }))
  assert.equal(view.street, 'PREFLOP')
  assert.equal(view.board.length, 0, 'no board is revealed preflop')
})

test('TV-005 version is monotonic across actions and increases on a new hand', () => {
  const config = handConfig(2)
  const v0 = buildTournamentTableView(baseInput({ seats: rawSeats(2), hand: { handId: 'h', config, log: [] } }))
  // apply one legal action
  const lv = liveView(config, [])
  const act: AppliedAction = lv.legal!.allowed.includes('call') ? { type: 'call' } : { type: 'fold' }
  const applied = applyAction(config, [], lv.turnSeat!, act)
  assert.ok(applied.ok)
  const log = (applied as { log: LoggedAction[] }).log
  const v1 = buildTournamentTableView(baseInput({ seats: rawSeats(2), hand: { handId: 'h', config, log } }))
  assert.ok(v1.version > v0.version, 'version must advance with an action')
  // a later hand number dominates the version
  const nextHand = { ...config, handNo: 4 }
  const v2 = buildTournamentTableView(baseInput({ seats: rawSeats(2), hand: { handId: 'h2', config: nextHand, log: [] } }))
  assert.ok(v2.version > v1.version, 'a new hand yields a strictly greater version')
})

test('TV-006 between hands (no live hand) → canContinue reflects ≥2 chipped seats, no cards', () => {
  const seats = rawSeats(3)
  const view = buildTournamentTableView(baseInput({ hand: null, seats }))
  assert.equal(view.handId, null)
  assert.equal(view.canContinue, true)
  for (const s of view.seats) assert.equal(s.cards, null)
  // Only one chipped seat → cannot continue.
  const oneLeft = seats.map((s, i) => ({ ...s, stack: i === 0 ? 18000 : 0, state: i === 0 ? 'active' : 'busted' }))
  const v2 = buildTournamentTableView(baseInput({ hand: null, seats: oneLeft }))
  assert.equal(v2.canContinue, false)
})

test('TV-007 button + blinds derive from the authoritative config', () => {
  const config = handConfig(3)
  const view = buildTournamentTableView(baseInput({ hand: { handId: 'h', config, log: [] } }))
  assert.equal(view.buttonSeat, 0)
  const sb = view.seats.find((s) => s.isSmallBlind)
  const bb = view.seats.find((s) => s.isBigBlind)
  assert.ok(sb && bb && sb.seatIndex !== bb.seatIndex, 'distinct SB/BB seats derived')
})

test('TV-008 toAppliedAction maps intents (and rejects malformed bet/raise)', () => {
  assert.deepEqual(toAppliedAction('fold'), { type: 'fold' })
  assert.deepEqual(toAppliedAction('check'), { type: 'check' })
  assert.deepEqual(toAppliedAction('call'), { type: 'call' })
  assert.deepEqual(toAppliedAction('all_in'), { type: 'all_in' })
  assert.deepEqual(toAppliedAction('bet', 300), { type: 'bet', to: 300 })
  assert.deepEqual(toAppliedAction('raise', 600), { type: 'raise', to: 600 })
  assert.equal(toAppliedAction('bet'), null, 'bet without amount is invalid')
  assert.equal(toAppliedAction('raise'), null, 'raise without amount is invalid')
  assert.equal(toAppliedAction('nonsense'), null)
})

test('TV-009 live stacks reflect the reconstructed hand, not the stale seat row', () => {
  const config = handConfig(2)
  // Force a raise so committed chips differ from the starting stack.
  const lv = liveView(config, [])
  const turn = lv.turnSeat!
  const raiseTo = lv.legal!.minRaiseTo
  const applied = applyAction(config, [], turn, { type: 'raise', to: raiseTo })
  assert.ok(applied.ok)
  const log = (applied as { log: LoggedAction[] }).log
  // Raw seat rows still show the pre-hand stack (6000); the view must show the live (reduced) stack.
  const view = buildTournamentTableView(baseInput({ seats: rawSeats(2), hand: { handId: 'h', config, log } }))
  const raiser = view.seats.find((s) => s.seatIndex === turn)!
  assert.ok(raiser.stack < 6000, 'raiser live stack must be below the pre-hand seat-row stack')
})

test('TV-010 assertTournamentViewPrivacy passes for every legitimately-built view', () => {
  const config = handConfig(3)
  // seated viewer with a live hand, spectator, and a between-hands (no-hand) projection.
  const seated = buildTournamentTableView(baseInput({ hand: { handId: 'h1', config, log: [] } }))
  const spectator = buildTournamentTableView(baseInput({ viewerSeatIndex: null, hand: { handId: 'h1', config, log: [] } }))
  const idle = buildTournamentTableView(baseInput({ hand: null }))
  // The builder already calls the assertion internally; calling it again must not throw.
  assert.doesNotThrow(() => assertTournamentViewPrivacy(seated))
  assert.doesNotThrow(() => assertTournamentViewPrivacy(spectator))
  assert.doesNotThrow(() => assertTournamentViewPrivacy(idle))
})

test('TV-011 assertTournamentViewPrivacy THROWS if a foreign seat carries hole cards', () => {
  const config = handConfig(3)
  const view = buildTournamentTableView(baseInput({ hand: { handId: 'h1', config, log: [] } }))
  // Tamper: graft the viewer's own cards onto an opponent seat (the leak the guard must catch).
  const own = view.seats.find((s) => s.seatIndex === 1)!.cards!
  const tampered: TournamentTableView = {
    ...view,
    seats: view.seats.map((s) => (s.seatIndex === 0 ? { ...s, cards: own } : s)),
  }
  assert.throws(() => assertTournamentViewPrivacy(tampered), /non-viewer seat carries hole cards/)
})

test('TV-012 assertTournamentViewPrivacy THROWS if a spectator view carries an actor model or cards', () => {
  const config = handConfig(2)
  const lv = liveView(config, [])
  const spectator = buildTournamentTableView(baseInput({ seats: rawSeats(2), viewerSeatIndex: null, hand: { handId: 'h', config, log: [] } }))
  // Tamper 1: spectator handed a legal-action model.
  assert.throws(
    () => assertTournamentViewPrivacy({ ...spectator, legal: lv.legal }),
    /spectator received a legal-action model/,
  )
  // Tamper 2: a legal model present without the viewer being on turn.
  const seated = buildTournamentTableView(baseInput({ seats: rawSeats(2), viewerSeatIndex: 0, hand: { handId: 'h', config, log: [] } }))
  assert.throws(
    () => assertTournamentViewPrivacy({ ...seated, legal: lv.legal, isMyTurn: false }),
    /without the viewer/,
  )
})
