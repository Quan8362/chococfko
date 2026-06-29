// ─────────────────────────────────────────────────────────────────────────────
// Strategic scenario library — deterministic, hand-crafted critical positions.
//
// Random self-play measures average strength; these scenarios assert SPECIFIC
// correct behaviour (blocking, finishing, structure preservation, control). Every
// candidate must pass all of them before promotion. Pure: each builds a fixed
// RoundState and checks the candidate's chosen BotMove against a clear predicate.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, DEFAULT_RULES, parseHand, parseCombo, toCode } from '../engine.ts'
import { type RoundState } from '../round.ts'
import { buildLegalMoves } from '../ai/legalMoves.ts'

export type DecideFn = (state: RoundState, seat: number) => { type: 'play'; cards: Card[] } | { type: 'pass' }

function mk(hands: Record<number, string>, over: Partial<RoundState> = {}): RoundState {
  const seats = Object.keys(hands).map(Number).sort((a, b) => a - b)
  const h: Record<number, Card[]> = {}
  const playedCount: Record<number, number> = {}
  for (const s of seats) { h[s] = parseHand(hands[s]); playedCount[s] = 13 - h[s].length }
  return {
    seats, roundNo: 2, rules: DEFAULT_RULES, hands: h, turnSeat: seats[0],
    trick: null, passed: [], playedCount, cutEvents: [],
    mustIncludeThreeSpade: false, status: 'playing', winner: null,
    instantWin: null, deltas: null, ...over,
  }
}

interface Scenario { name: string; category: string; state: RoundState; seat: number; ok: (move: ReturnType<DecideFn>, state: RoundState, seat: number) => boolean }

const isMulti = (m: ReturnType<DecideFn>) => m.type === 'play' && m.cards.length >= 2
const playedType = (m: ReturnType<DecideFn>) => m.type === 'play' ? parseCombo(m.cards)?.type ?? null : null

export const SCENARIOS: Scenario[] = [
  // ── Blocking ──────────────────────────────────────────────────────────────
  {
    name: 'block: opp on 1 card, bot leads — prefer a pair over an unsafe single',
    category: 'blocking',
    state: mk({ 0: '4C 4D 6C 9H', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => isMulti(m),
  },
  {
    name: 'block: opp on 1 card — triple available as a safe lead',
    category: 'blocking',
    state: mk({ 0: '5C 5D 5H 8S', 1: 'KC', 2: 'QD JD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => isMulti(m),
  },
  {
    name: 'block: opp on 1 card — straight available as a safe lead',
    category: 'blocking',
    state: mk({ 0: '4C 5D 6S 9H', 1: 'KC', 2: 'QD JD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => isMulti(m),
  },
  {
    name: 'block: chop a single 2 with a bomb to deny a one-card opponent',
    category: 'blocking',
    // Seat 1 (1 card) is irrelevant; the table is a single 2 led by seat 2 and bot can chặt.
    state: mk({ 0: '7C 7D 7H 7S', 1: '3D', 2: '5S' },
      { turnSeat: 0, trick: { cards: parseHand('2S'), bySeat: 2 }, passed: [], playedCount: { 0: 9, 1: 12, 2: 12 } }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) === 'four',
  },

  // ── Finishing ─────────────────────────────────────────────────────────────
  {
    name: 'finish: take the immediate win (empty the hand)',
    category: 'finishing',
    state: mk({ 0: '9S 9D', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 11, 1: 12, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => m.type === 'play' && m.cards.length === st.hands[seat].length,
  },
  {
    name: 'finish: do not break the final winning combination',
    category: 'finishing',
    // Holding exactly a straight 3-4-5: going out with the whole straight wins.
    state: mk({ 0: '3C 4D 5S', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 10, 1: 12, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => m.type === 'play' && m.cards.length === st.hands[seat].length,
  },

  // ── Structure preservation ──────────────────────────────────────────────────
  {
    name: 'preserve: keep a triple intact while leading (shed a low single instead)',
    category: 'structure',
    state: mk({ 0: '3C 9C 9D 9H', 1: 'KC AC 5S 5D', 2: 'KD AD 7S 7D' }, { turnSeat: 0 }),
    seat: 0,
    ok: (m) => {
      if (m.type !== 'play') return false
      // must not peel a single 9 out of the 9-triple
      const ranks = m.cards.map(c => c.rank)
      const nineRank = parseHand('9C')[0].rank
      const usedNines = ranks.filter(r => r === nineRank).length
      return !(m.cards.length === 1 && usedNines === 1)
    },
  },
  {
    name: 'preserve: keep a bomb (tứ quý) in reserve in a calm position',
    category: 'structure',
    state: mk({ 0: '7C 7D 7H 7S 3C', 1: 'KC AC 5S 5D', 2: 'KD AD 8S 8D' }, { turnSeat: 0 }),
    seat: 0,
    ok: (m) => m.type === 'play' && playedType(m) !== 'four',
  },

  // ── Control ─────────────────────────────────────────────────────────────────
  {
    name: 'control: answer a pair with the LOWEST sufficient higher pair',
    category: 'control',
    // Calm position (opponents hold 6 cards each, no acute threat) so conserving the
    // high pair and answering with the lowest sufficient pair is correct.
    state: mk({ 0: '6S 6D KH KS', 1: '7C 8C 9C TC JC 3D', 2: '7S 8S 9S TS JS 3H' },
      { turnSeat: 0, trick: { cards: parseHand('4C 4H'), bySeat: 1 }, passed: [] }),
    seat: 0,
    ok: (m, st, seat) => {
      if (m.type !== 'play') return false
      const table = st.trick ? parseCombo(st.trick.cards) : null
      const beats = buildLegalMoves(st.hands[seat], table, st.rules).filter(x => x.combinationType === 'pair')
      const lowest = beats.slice().sort((a, b) => a.primaryRank - b.primaryRank)[0]
      return lowest != null && parseCombo(m.cards)?.high.rank === lowest.primaryRank
    },
  },
  {
    name: 'control: pass when the only beat is a 2 and no opponent is dangerous',
    category: 'control',
    state: mk(
      { 0: '2S 4C 5D 6H 7S 8C', 1: '9C TC JC QC KC AC', 2: '9D TD JD QD KD AD' },
      { turnSeat: 0, trick: { cards: parseHand('KH'), bySeat: 1 }, passed: [], playedCount: { 0: 7, 1: 7, 2: 7 } },
    ),
    seat: 0,
    ok: m => m.type === 'pass',
  },
]

export interface ScenarioResult { name: string; category: string; pass: boolean; detail: string }

export function runScenarios(decide: DecideFn): ScenarioResult[] {
  return SCENARIOS.map(sc => {
    let move: ReturnType<DecideFn>
    try { move = decide(sc.state, sc.seat) } catch (e) { return { name: sc.name, category: sc.category, pass: false, detail: `threw: ${String(e)}` } }
    const pass = sc.ok(move, sc.state, sc.seat)
    const detail = move.type === 'play' ? move.cards.map(toCode).join(' ') : 'PASS'
    return { name: sc.name, category: sc.category, pass, detail }
  })
}

export function allScenariosPass(decide: DecideFn): boolean {
  return runScenarios(decide).every(r => r.pass)
}
