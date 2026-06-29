// ─────────────────────────────────────────────────────────────────────────────
// Headless deterministic simulator.
//
// Runs full Tiến Lên rounds with NO React / Supabase / realtime — using the SAME
// engine as production (dealRound / applyPlay / applyPass / parseCombo / beats).
// There is NO second rule engine. Policies receive RoundState + their own seat and
// the PUBLIC play log; the AI adapter builds a public view internally (fairness).
// Every move is validated by the engine; an illegal policy move is counted and
// replaced by the always-legal timeout move so a bad policy is flagged, not crashed.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, type Rules, parseCombo, resolveRules, createDeck, shuffle } from '../engine.ts'
import { dealRound, applyPlay, applyPass, applyTimeout, type RoundState } from '../round.ts'
import { makeRng } from '../ai/seededRandom.ts'
import { buildLegalMoves } from '../ai/legalMoves.ts'

export type BotMove = { type: 'play'; cards: Card[] } | { type: 'pass' }

export interface SimPolicy {
  name: string
  // Pure decision from the round + the bot's seat + the public play log so far.
  decide: (state: RoundState, seat: number, rng: () => number, seenCards: Card[]) => BotMove
}

export interface SimulatedPlay {
  seat: number
  kind: 'play' | 'pass'
  cards: Card[]
  illegal: boolean
}

// Per-turn decision-quality audit for ONE designated seat (the candidate under test).
export interface SeatAudit {
  immediateWinsAvailable: number          // turns where a move would empty the hand
  immediateWinsTaken: number              // …and the seat took it
  riskySingleLeadsUnderThreat: number     // led a single while an opponent had 1 card and a safer multi-card lead existed
}

export interface SimulatedGameResult {
  seed: string
  winnerSeat: number | null
  policyBySeat: Record<number, string>
  finishOrder: number[]
  turns: number
  plays: SimulatedPlay[]
  illegalMoveCount: number
  decisionTimeMs: number[]
  finalCardCounts: Record<number, number>
  audit: SeatAudit | null
  auditSeat: number | null
}

export interface RunGameOptions {
  seed: string | number
  policies: SimPolicy[]      // index = seat
  playerCount?: number       // defaults to policies.length
  ruleConfig?: Partial<Rules>
  maxTurns?: number          // safety guard
  auditSeat?: number         // collect decision-quality audit for this seat
}

export function runGame(opts: RunGameOptions): SimulatedGameResult {
  const playerCount = opts.playerCount ?? opts.policies.length
  const rules: Rules = resolveRules(opts.ruleConfig)
  const seedStr = String(opts.seed)
  const rng = makeRng(opts.seed)
  const seats = Array.from({ length: playerCount }, (_, i) => i)
  const deck = shuffle(createDeck(), rng)

  let state = dealRound({ seats, roundNo: 2, rules, deck, previousWinner: 0 })

  const policyBySeat: Record<number, string> = {}
  for (const s of seats) policyBySeat[s] = opts.policies[s]?.name ?? `seat${s}`

  const plays: SimulatedPlay[] = []
  const decisionTimeMs: number[] = []
  const seen: Card[] = []
  let illegalMoveCount = 0
  let turns = 0
  const maxTurns = opts.maxTurns ?? 600
  const auditSeat = opts.auditSeat ?? null
  const audit: SeatAudit | null = auditSeat != null
    ? { immediateWinsAvailable: 0, immediateWinsTaken: 0, riskySingleLeadsUnderThreat: 0 }
    : null

  while (state.status === 'playing' && turns < maxTurns) {
    turns++
    const seat = state.turnSeat

    // Decision-quality audit for the designated seat (before it acts).
    let winAvailable = false
    let oppOneCard = false
    let saferMultiExists = false
    if (audit && seat === auditSeat) {
      const table = state.trick ? parseCombo(state.trick.cards) : null
      const moves = buildLegalMoves(state.hands[seat], table, state.rules, state.mustIncludeThreeSpade)
      winAvailable = moves.some(m => m.cardCount === state.hands[seat].length)
      if (winAvailable) audit.immediateWinsAvailable++
      oppOneCard = state.seats.some(s => s !== seat && state.hands[s].length === 1)
      saferMultiExists = state.trick === null && moves.some(m => m.cardCount >= 2)
    }

    const policy = opts.policies[seat]
    const t0 = performance.now()
    let move: BotMove
    try {
      move = policy.decide(state, seat, rng, seen.slice())
    } catch {
      move = { type: 'pass' } // a throwing policy is treated as a pass attempt
    }
    decisionTimeMs.push(performance.now() - t0)

    if (audit && seat === auditSeat) {
      if (winAvailable && move.type === 'play' && move.cards.length === state.hands[seat].length) audit.immediateWinsTaken++
      if (state.trick === null && oppOneCard && saferMultiExists && move.type === 'play' && move.cards.length === 1)
        audit.riskySingleLeadsUnderThreat++
    }

    let res = move.type === 'play' ? applyPlay(state, seat, move.cards) : applyPass(state, seat)
    let illegal = false
    if (!res.ok) {
      illegal = true
      illegalMoveCount++
      res = applyTimeout(state) // always-legal fallback keeps the round progressing
      if (!res.ok) break        // truly stuck (should never happen)
    }
    const applied: SimulatedPlay = {
      seat,
      kind: move.type,
      cards: move.type === 'play' && !illegal ? move.cards : (res.state.trick && res.state.trick.bySeat === seat ? res.state.trick.cards : []),
      illegal,
    }
    if (applied.kind === 'play') for (const c of applied.cards) seen.push(c)
    plays.push(applied)
    state = res.state
  }

  const finalCardCounts: Record<number, number> = {}
  for (const s of seats) finalCardCounts[s] = state.hands[s].length

  // đếm-lá ends on the first player out → winner is the Nhất; rank the rest by cards left.
  const winnerSeat = state.winner
  const others = seats.filter(s => s !== winnerSeat).sort((a, b) => finalCardCounts[a] - finalCardCounts[b])
  const finishOrder = winnerSeat != null ? [winnerSeat, ...others] : others

  return {
    seed: seedStr,
    winnerSeat,
    policyBySeat,
    finishOrder,
    turns,
    plays,
    illegalMoveCount,
    decisionTimeMs,
    finalCardCounts,
    audit,
    auditSeat,
  }
}
