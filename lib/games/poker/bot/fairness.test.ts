import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seededShuffle, deal } from '../deck.ts'
import { createRound, makePlayer, legalActions, amountToCall, minRaiseTo, maxRaiseTo } from '../betting.ts'
import {
  buildObservation,
  assertObservationClean,
  FORBIDDEN_OBSERVATION_KEYS,
  type ObservedSeat,
} from './observation.ts'

// Build a realistic mid-hand observation from a full deal, then prove — structurally — that the
// observation carries NO hidden information a human in the seat could not see.
function midHandObservation(seed: number, seatCount: number, seatIndex: number) {
  const shuffled = seededShuffle(seed)
  const dealt = deal(shuffled, seatCount)
  const fullBoard = [...dealt.flop, dealt.turn, dealt.river]
  const players = Array.from({ length: seatCount }, (_, i) =>
    makePlayer({ seatIndex: i, stack: 10000, committedThisStreet: i === 0 ? 100 : 0 }),
  )
  const round = createRound({ street: 'FLOP', bigBlind: 100, players })
  const seats: ObservedSeat[] = players.map((p) => ({
    seatIndex: p.seatIndex,
    stack: p.stack,
    committedThisStreet: p.committedThisStreet,
    committedTotal: p.committedTotal,
    status: p.status,
    inHand: true,
  }))
  const obs = buildObservation({
    seatIndex,
    holeCards: dealt.holeBySeat[seatIndex],
    fullBoard,
    street: 'FLOP',
    seats,
    buttonSeat: 0,
    bigBlind: 100,
    currentBet: round.currentBet,
    toCall: amountToCall(round, seatIndex),
    minRaiseTo: minRaiseTo(round),
    maxRaiseTo: maxRaiseTo(round, seatIndex),
    legal: legalActions(round, seatIndex),
    actionHistory: [],
  })
  return { obs, dealt, fullBoard }
}

test('observation only reveals the street’s board — future cards are structurally absent', () => {
  const { obs, fullBoard } = midHandObservation(12345, 6, 2)
  // FLOP reveals exactly 3 board cards; turn and river must NOT be present.
  assert.equal(obs.board.length, 3)
  assert.deepEqual(obs.board, fullBoard.slice(0, 3))
  assert.ok(!obs.board.includes(fullBoard[3]), 'turn card leaked into observation')
  assert.ok(!obs.board.includes(fullBoard[4]), 'river card leaked into observation')
})

test('observation NEVER contains any opponent’s hole cards (deep scan)', () => {
  const seatCount = 6
  const me = 2
  const { obs, dealt } = midHandObservation(777, seatCount, me)

  // Collect every card visible anywhere in the observation (own hole + board only).
  const visible = new Set<string>([...obs.holeCards, ...obs.board])

  // Every opponent card must be ABSENT from the observation's visible set...
  for (let s = 0; s < seatCount; s++) {
    if (s === me) continue
    for (const card of dealt.holeBySeat[s]) {
      assert.ok(!visible.has(card), `opponent seat ${s} card ${card} is visible to the bot`)
    }
  }

  // ...and absent from the FULL JSON serialization (catches any accidental nested leak).
  const json = JSON.stringify(obs)
  for (let s = 0; s < seatCount; s++) {
    if (s === me) continue
    for (const card of dealt.holeBySeat[s]) {
      // A card could coincidentally equal one of MY own cards? No — a 52-card deal has no dupes.
      assert.ok(!json.includes(`"${card}"`), `opponent card ${card} serialized into the observation`)
    }
  }
})

test('own hole cards ARE present (a bot sees its own two cards)', () => {
  const { obs, dealt } = midHandObservation(42, 4, 1)
  assert.deepEqual(obs.holeCards, dealt.holeBySeat[1])
})

test('assertObservationClean rejects a forbidden hidden-info key', () => {
  const { obs } = midHandObservation(9, 3, 0)
  for (const key of FORBIDDEN_OBSERVATION_KEYS) {
    const tainted = { ...obs, [key]: 'SECRET' } as typeof obs
    assert.throws(() => assertObservationClean(tainted), new RegExp(key))
  }
})

test('assertObservationClean rejects a board that does not match the street', () => {
  const { obs } = midHandObservation(11, 2, 0)
  const badBoard = { ...obs, board: obs.board.slice(0, 2) } // 2 cards on a FLOP → illegal
  assert.throws(() => assertObservationClean(badBoard), /board/)
})

test('a clean, honestly-built observation passes the guard', () => {
  const { obs } = midHandObservation(2024, 5, 3)
  assert.doesNotThrow(() => assertObservationClean(obs))
})

test('no field named seed/deck/rng/holeBySeat exists on the observation type', () => {
  const { obs } = midHandObservation(1, 2, 0)
  const keys = Object.keys(obs)
  for (const forbidden of ['seed', 'deck', 'rng', 'holeBySeat', 'shuffled', 'winner']) {
    assert.ok(!keys.includes(forbidden), `observation exposes forbidden field ${forbidden}`)
  }
})
