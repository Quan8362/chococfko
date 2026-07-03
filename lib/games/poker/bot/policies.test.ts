import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { seededShuffle, deal } from '../deck.ts'
import {
  createRound,
  makePlayer,
  legalActions,
  amountToCall,
  minRaiseTo,
  maxRaiseTo,
  type BettingPlayer,
} from '../betting.ts'
import { buildObservation, type ObservedSeat } from './observation.ts'
import { POLICIES, policyFor, simulationPolicy } from './policies.ts'
import { isDecisionLegal, type BotDifficulty } from './policy.ts'
import type { Street } from '../types.ts'

// Construct a broad set of realistic observations by dealing random hands and putting a random
// legal betting posture on the table, then confirm each policy proposes a LEGAL action every time.
function* observations(count: number) {
  const streets: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']
  for (let i = 0; i < count; i++) {
    const rng = makeRng(1000 + i)
    const seatCount = 2 + Math.floor(rng() * 5) // 2..6
    const dealt = deal(seededShuffle(1000 + i), seatCount)
    const fullBoard = [...dealt.flop, dealt.turn, dealt.river]
    const street = streets[Math.floor(rng() * streets.length)]

    const players: BettingPlayer[] = Array.from({ length: seatCount }, (_, s) => {
      const committed = Math.floor(rng() * 3) * 100 // 0, 100, or 200 already in this street
      return makePlayer({ seatIndex: s, stack: 200 + Math.floor(rng() * 90) * 100, committedThisStreet: committed })
    })
    const round = createRound({ street, bigBlind: 100, players })
    const actor = Math.floor(rng() * seatCount)
    const legal = legalActions(round, actor)
    if (legal.length === 0) continue

    const seats: ObservedSeat[] = players.map((p) => ({
      seatIndex: p.seatIndex,
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      committedTotal: p.committedTotal,
      status: p.status,
      inHand: p.status === 'active' || p.status === 'allin',
    }))
    yield buildObservation({
      seatIndex: actor,
      holeCards: dealt.holeBySeat[actor],
      fullBoard,
      street,
      seats,
      buttonSeat: 0,
      bigBlind: 100,
      currentBet: round.currentBet,
      toCall: amountToCall(round, actor),
      minRaiseTo: minRaiseTo(round),
      maxRaiseTo: maxRaiseTo(round, actor),
      legal,
      actionHistory: [],
    })
  }
}

const DIFFICULTIES: BotDifficulty[] = ['simulation', 'easy', 'normal', 'hard']

test('every policy proposes a LEGAL action for a broad sample of states', () => {
  for (const d of DIFFICULTIES) {
    const policy = policyFor(d)
    let checked = 0
    for (const obs of observations(160)) {
      const rng = makeRng(obs.seatIndex * 31 + 5)
      const decision = policy(obs, rng)
      assert.ok(
        isDecisionLegal(obs, decision.action),
        `${d} policy proposed an illegal action ${JSON.stringify(decision.action)}`,
      )
      checked += 1
    }
    assert.ok(checked > 100, `too few states checked for ${d}`)
  }
})

test('bet/raise amounts are integers within the legal band', () => {
  for (const d of DIFFICULTIES) {
    const policy = policyFor(d)
    for (const obs of observations(120)) {
      const decision = policy(obs, makeRng(7))
      const a = decision.action
      if (a.type === 'bet' || a.type === 'raise') {
        assert.ok(Number.isInteger(a.to), `${d} produced non-integer to=${a.to}`)
        const legal = obs.legal.find((x) => x.type === a.type)
        assert.ok(legal && legal.type === a.type)
        if (legal && legal.type === a.type) {
          assert.ok(a.to >= legal.min && a.to <= legal.max, `${d} to=${a.to} outside [${legal.min},${legal.max}]`)
        }
      }
    }
  }
})

test('simulation policy is deterministic given its rng', () => {
  for (const obs of observations(50)) {
    const a = simulationPolicy(obs, makeRng(999))
    const b = simulationPolicy(obs, makeRng(999))
    assert.deepEqual(a.action, b.action)
  }
})

test('registry exposes exactly the four difficulties', () => {
  assert.deepEqual(Object.keys(POLICIES).sort(), ['easy', 'hard', 'normal', 'simulation'])
})

test('stronger policies fold trash and back strong hands (directional sanity)', () => {
  // A dry board, facing a pot-size bet with pure air vs a strong made hand.
  function facing(hole: [string, string], board: string[]) {
    const seats: ObservedSeat[] = [
      { seatIndex: 0, stack: 900, committedThisStreet: 0, committedTotal: 100, status: 'active', inHand: true },
      { seatIndex: 1, stack: 700, committedThisStreet: 300, committedTotal: 400, status: 'active', inHand: true },
    ]
    return buildObservation({
      seatIndex: 0,
      holeCards: hole as [import('../types.ts').Card, import('../types.ts').Card],
      fullBoard: board as import('../types.ts').Card[],
      street: 'FLOP',
      seats,
      buttonSeat: 0,
      bigBlind: 100,
      currentBet: 300,
      toCall: 300,
      minRaiseTo: 600,
      maxRaiseTo: 900,
      legal: [{ type: 'fold' }, { type: 'call', amount: 300 }, { type: 'raise', min: 600, max: 900 }],
      actionHistory: [],
    })
  }
  // Pure air on a board that doesn't help: normal/hard should fold facing a big bet.
  const air = facing(['2c', '7d'], ['As', 'Kd', 'Qc'])
  assert.equal(policyFor('normal')(air, makeRng(3)).action.type, 'fold')
  assert.equal(policyFor('hard')(air, makeRng(3)).action.type, 'fold')

  // A set: normal/hard should never fold (call or raise for value).
  const strong = facing(['Ac', 'As'], ['Ah', 'Kd', 'Qc'])
  assert.notEqual(policyFor('normal')(strong, makeRng(3)).action.type, 'fold')
  assert.notEqual(policyFor('hard')(strong, makeRng(3)).action.type, 'fold')
})
