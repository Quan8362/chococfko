// ─────────────────────────────────────────────────────────────────────────────
// Strategic scenario library — deterministic, hand-crafted critical positions.
//
// Random self-play measures average strength; these scenarios assert SPECIFIC
// correct behaviour (blocking, finishing, structure preservation, control). Every
// candidate must pass all of them before promotion. Pure: each builds a fixed
// RoundState and checks the candidate's chosen BotMove against a clear predicate.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, R2, DEFAULT_RULES, parseHand, parseCombo, toCode } from '../engine.ts'
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
// A "hard" lead vs a one-card opponent: anything that is NOT a beatable low single
// (i.e. a multi-card combo, or a single 2/heo which cannot be topped).
const isHardLead = (m: ReturnType<DecideFn>) => m.type === 'play' && (m.cards.length >= 2 || m.cards[0].rank === R2)
const isWin = (m: ReturnType<DecideFn>, st: RoundState, seat: number) => m.type === 'play' && m.cards.length === st.hands[seat].length
const usesRanks = (m: ReturnType<DecideFn>, ranks: number[]) =>
  m.type === 'play' && m.cards.some(c => ranks.includes(c.rank))
const rankOf = (code: string) => parseHand(code)[0].rank

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

  // ── Blocking: opponent on ONE card ───────────────────────────────────────────
  {
    name: 'block: opp on 1 card, only safe lead is the 2 — lead it, not a low single',
    category: 'blocking',
    state: mk({ 0: '3C 7D 2S', 1: 'KC', 2: 'QD' }, { turnSeat: 0, playedCount: { 0: 10, 1: 12, 2: 12 } }),
    seat: 0,
    ok: m => isHardLead(m),
  },
  {
    name: 'block: dangerous 1-card opp acts immediately after the bot — hard lead',
    category: 'blocking',
    state: mk({ 0: '4C 4D 5C 9H', 1: 'AC', 2: '8D 8H' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => isHardLead(m),
  },
  {
    name: 'block: 1-card opp acts later (seat 2) — still deny with a hard lead',
    category: 'blocking',
    state: mk({ 0: '6C 6D 7C TH', 1: '8D 8H', 2: 'AC' }, { turnSeat: 0, playedCount: { 0: 9, 1: 11, 2: 12 } }),
    seat: 0,
    ok: m => isHardLead(m),
  },
  {
    name: 'block: consecutive pairs available as a hard lead vs a 1-card opp',
    category: 'blocking',
    state: mk({ 0: '5C 5D 6C 6D 7C 7D', 1: 'KC', 2: 'QD' }, { turnSeat: 0, playedCount: { 0: 7, 1: 12, 2: 12 } }),
    seat: 0,
    ok: m => isHardLead(m),
  },
  {
    name: 'finish: following — beat the table with a triple to empty the hand',
    category: 'finishing',
    state: mk({ 0: 'KC KD KH', 1: '3C 4C', 2: '5D 6D' },
      { turnSeat: 0, trick: { cards: parseHand('9S 9D 9H'), bySeat: 2 }, passed: [], playedCount: { 0: 10, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'structure: keep consecutive pairs (đôi thông) intact — shed the isolated low single',
    category: 'structure',
    state: mk({ 0: '4C 4D 5C 5D 6C 6D 3H', 1: 'KC AC 9S', 2: 'KD AD 8S' }, { turnSeat: 0 }),
    seat: 0,
    ok: m => {
      if (m.type !== 'play') return false
      const runRanks = ['4C', '5C', '6C'].map(rankOf)
      // must not peel a single out of the consecutive-pair block
      return !(m.cards.length === 1 && runRanks.includes(m.cards[0].rank))
    },
  },
  {
    name: 'pass: dangerous opp already passed and only a premium beats — conserve, pass',
    category: 'pass',
    state: mk(
      { 0: '2S 5C 6D 7H 8S 9C', 1: 'TC JC QC KC AC 3C', 2: 'TD JD QD KD AD 3D' },
      { turnSeat: 0, trick: { cards: parseHand('KH'), bySeat: 2 }, passed: [1], playedCount: { 0: 7, 1: 7, 2: 7 } },
    ),
    seat: 0,
    ok: m => m.type === 'pass',
  },
  {
    name: 'use four: cut a 3-consecutive-pairs run with a tứ quý when an opponent is finishing',
    category: 'structure',
    // Table is a 3 đôi thông (a bomb); a 1-card opp looms → chopping with the tứ quý is right.
    state: mk({ 0: '6C 6D 6H 6S', 1: '3D', 2: 'QS JS' },
      { turnSeat: 0, trick: { cards: parseHand('7C 7D 8C 8D 9C 9D'), bySeat: 2 }, passed: [], playedCount: { 0: 9, 1: 12, 2: 7 } }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) === 'four',
  },
  {
    name: 'block: bomb is NECESSARY — chop the table single 2 from a 1-card opp threat',
    category: 'blocking',
    state: mk({ 0: '8C 8D 8H 8S', 1: '3D', 2: '5S' },
      { turnSeat: 0, trick: { cards: parseHand('2H'), bySeat: 2 }, passed: [], playedCount: { 0: 9, 1: 12, 2: 12 } }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) === 'four',
  },
  {
    name: 'block: dangerous opp already PASSED this trick — no need to overspend',
    category: 'blocking',
    // Table is a low single; the 1-card opp (seat 1) already passed, so a cheap beat is fine.
    state: mk({ 0: '4C 9D KH 2S', 1: 'AC', 2: '6D 6H' },
      { turnSeat: 0, trick: { cards: parseHand('3D'), bySeat: 2 }, passed: [1], playedCount: { 0: 9, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) !== 'four',
  },

  // ── Opponent on TWO/THREE cards ──────────────────────────────────────────────
  {
    name: 'pressure: opp on 2 cards — lead a hard combo rather than a beatable low single',
    category: 'blocking',
    state: mk({ 0: '5C 5D 8C 9H', 1: 'KC KD', 2: 'QD JD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 11, 2: 11 } }),
    seat: 0,
    ok: m => isMulti(m),
  },
  {
    name: 'pressure: opp on 3 likely-singles — keep control with a strong shape',
    category: 'blocking',
    state: mk({ 0: '7C 7D 7H 4C', 1: 'KC 9D 3H', 2: 'QD JD TH' }, { turnSeat: 0, playedCount: { 0: 9, 1: 10, 2: 10 } }),
    seat: 0,
    ok: m => isMulti(m) || (m.type === 'play' && m.cards[0].rank <= rankOf('4C')),
  },

  // ── Finishing: immediate & forced wins ───────────────────────────────────────
  {
    name: 'finish: immediate win with a pair (empty the hand)',
    category: 'finishing',
    state: mk({ 0: 'KC KD', 1: '3C 4C', 2: '5D 6D' }, { turnSeat: 0, playedCount: { 0: 11, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'finish: immediate win with a triple',
    category: 'finishing',
    state: mk({ 0: 'QC QD QH', 1: '3C 4C', 2: '5D 6D' }, { turnSeat: 0, playedCount: { 0: 10, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'finish: immediate win with a straight (whole hand)',
    category: 'finishing',
    state: mk({ 0: '3C 4D 5S 6H', 1: '7C 8C', 2: '9D TD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'finish: following — beat the table to empty the hand (single)',
    category: 'finishing',
    state: mk({ 0: 'KC', 1: '3C 4C', 2: '5D 6D' },
      { turnSeat: 0, trick: { cards: parseHand('9H'), bySeat: 2 }, passed: [], playedCount: { 0: 12, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'finish: following — beat the table to empty the hand (pair)',
    category: 'finishing',
    state: mk({ 0: 'KC KD', 1: '3C 4C', 2: '5D 6D' },
      { turnSeat: 0, trick: { cards: parseHand('9H 9S'), bySeat: 2 }, passed: [], playedCount: { 0: 11, 1: 11, 2: 11 } }),
    seat: 0,
    ok: (m, st, seat) => isWin(m, st, seat),
  },
  {
    name: 'finish: forced win in two — play the pair, leaving an unbeatable 2',
    category: 'finishing',
    // KK then 2 is a guaranteed two-move out; playing the single 2 first strands KK.
    state: mk({ 0: '2S KC KD', 1: '3C 4C 5C', 2: '6D 7D 8D' }, { turnSeat: 0, playedCount: { 0: 10, 1: 10, 2: 10 } }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) === 'pair',
  },
  {
    name: 'finish: lead the high card first so the weak last card still goes out (vs 1-card opp)',
    category: 'finishing',
    // 4C+KH vs a 1-card opp holding Q: lead KH (unbeatable here) then go out with 4C.
    // Leading 4C lets the opp beat it with Q and win — so the high card must go first.
    state: mk({ 0: '4C KH', 1: 'QD', 2: '5D 6D' }, { turnSeat: 0, playedCount: { 0: 11, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => m.type === 'play' && m.cards.length === 1 && m.cards[0].rank === rankOf('KH'),
  },

  // ── Structure preservation ───────────────────────────────────────────────────
  {
    name: 'preserve: keep a pair intact while leading (shed an isolated low single)',
    category: 'structure',
    state: mk({ 0: '3C 8C 8D KH', 1: 'AC 5S 5D', 2: 'AD 7S 7D' }, { turnSeat: 0 }),
    seat: 0,
    ok: m => {
      if (m.type !== 'play') return false
      const eight = rankOf('8C')
      return !(m.cards.length === 1 && m.cards[0].rank === eight)
    },
  },
  {
    name: 'preserve: do not fragment a straight when a cheaper lead exists',
    category: 'structure',
    state: mk({ 0: '3C 4C 5C 6C TH', 1: 'AC 9S 9D', 2: 'AD 8S 8D' }, { turnSeat: 0 }),
    seat: 0,
    ok: m => {
      if (m.type !== 'play') return false
      const straightRanks = ['4C', '5C', '6C'].map(rankOf) // breaking these mid-straight is the fault
      return !(m.cards.length === 1 && straightRanks.includes(m.cards[0].rank))
    },
  },
  {
    name: 'preserve: keep a bomb (tứ quý) in reserve in a calm position (2 lead path)',
    category: 'structure',
    state: mk({ 0: '9C 9D 9H 9S 3C 4C', 1: 'KC AC 5S 5D', 2: 'KD AD 8S 8D' }, { turnSeat: 0 }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) !== 'four',
  },
  {
    name: 'preserve: answer a harmless low single with a non-premium (never burn the 2)',
    category: 'structure',
    state: mk({ 0: '6C 9D KH 2S', 1: '3C 4C 5C 7C 8C TC', 2: '3D 4D 5D 7D 8D TD' },
      { turnSeat: 0, trick: { cards: parseHand('5H'), bySeat: 1 }, passed: [], playedCount: { 0: 9, 1: 7, 2: 7 } }),
    seat: 0,
    ok: m => m.type === 'play' && m.cards.length === 1 && m.cards[0].rank !== R2,
  },

  // ── Control ──────────────────────────────────────────────────────────────────
  {
    name: 'control: answer a triple with the lowest sufficient higher triple',
    category: 'control',
    state: mk({ 0: '8C 8D 8H KC KD KH', 1: '3C 4C 5C 6C 7C 9C', 2: '3D 4D 5D 6D 7D 9D' },
      { turnSeat: 0, trick: { cards: parseHand('5S 5H 5C'), bySeat: 1 }, passed: [] }),
    seat: 0,
    ok: m => m.type === 'play' && playedType(m) === 'triple' && (parseCombo(m.cards)?.high.rank === rankOf('8C')),
  },
  {
    name: 'control: when leading calmly, do not burn a 2 needlessly',
    category: 'control',
    state: mk({ 0: '3C 5D 7H 9S JC 2D', 1: '4C 6C 8C TC QC KC', 2: '4D 6D 8D TD QD KD' }, { turnSeat: 0 }),
    seat: 0,
    ok: m => !usesRanks(m, [R2]),
  },
  {
    name: 'control: do not burn the 2 (or a bomb) to answer a harmless low single when calm',
    category: 'control',
    state: mk({ 0: '7C 9D JH KS 2S 3C', 1: '4C 5C 6C 8C TC QC', 2: '4D 5D 6D 8D TD QD' },
      { turnSeat: 0, trick: { cards: parseHand('5H'), bySeat: 1 }, passed: [] }),
    seat: 0,
    ok: m => m.type === 'play' && m.cards.length === 1 && m.cards[0].rank !== R2,
  },

  // ── Pass decisions ───────────────────────────────────────────────────────────
  {
    name: 'pass: do not pass when an opponent can finish next and a cheap beat exists',
    category: 'pass',
    // Opp seat 1 has 1 card; if bot passes, control may hand them the win. A cheap beat is available.
    state: mk({ 0: '4C 6D 9H', 1: 'KC', 2: '3D 3H' },
      { turnSeat: 0, trick: { cards: parseHand('3S'), bySeat: 2 }, passed: [], playedCount: { 0: 10, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => m.type === 'play',
  },
  {
    name: 'pass: conserve — pass when only a premium beats and the table is no threat',
    category: 'pass',
    state: mk({ 0: '2S 4C 5D 6H 7S 8C', 1: '9C TC JC QC KC AC', 2: '9D TD JD QD KD AD' },
      { turnSeat: 0, trick: { cards: parseHand('AH'), bySeat: 1 }, passed: [], playedCount: { 0: 7, 1: 7, 2: 7 } }),
    seat: 0,
    ok: m => m.type === 'pass',
  },

  // ── Seat order ───────────────────────────────────────────────────────────────
  {
    name: 'seat: dangerous 1-card player sits right after the bot — hardest available lead',
    category: 'seat',
    state: mk({ 0: '5C 5D 6C 6D KH', 1: 'AC', 2: '9D 9H' }, { turnSeat: 0, playedCount: { 0: 8, 1: 12, 2: 11 } }),
    seat: 0,
    ok: m => isHardLead(m),
  },
  {
    name: 'seat: 1-card player sits before the bot (acts last) — still avoid a low single lead',
    category: 'seat',
    state: mk({ 0: '7C 7D 8C TH', 1: '9D 9H', 2: 'AC' }, { turnSeat: 0, playedCount: { 0: 9, 1: 11, 2: 12 } }),
    seat: 0,
    ok: m => isHardLead(m),
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
