// ─────────────────────────────────────────────────────────────────────────────
// Tiến Lên Miền Nam — pure ROUND state machine (server-authoritative).
//
// Framework-agnostic, like engine.ts: NO React / Supabase / next imports. The
// realtime server action (Phase 3) loads the real hands + game row from the DB,
// rebuilds a RoundState, applies ONE action through the reducers here, then
// persists the diff. Keeping the logic pure makes the full lifecycle unit-testable
// (deal → trick flow → đếm-lá settlement, tới trắng, chặt, cóng, thối) and means
// the engine stays the single source of truth for legality + scoring.
// ─────────────────────────────────────────────────────────────────────────────
import {
  type Card, type Combo, type Rules, type InstantWinType,
  type CutEvent, type SettlementState,
  R2, R3, SUIT_SPADE,
  strength, cardsEqual, parseCombo, beats, explainBeat, legalMoves, sortHand,
  createDeck, shuffle, checkInstantWin, instantWinStrength, settleRound, resolveRules,
} from './engine.ts'

// Full, server-internal round state — includes the SECRET hands. Never sent whole
// to a client; the action projects only the public fields (see toPublic in actions).
export type RoundState = {
  seats: number[]                         // participating seat indices, ascending
  roundNo: number
  rules: Rules
  hands: Record<number, Card[]>           // SECRET — each seat's remaining cards
  turnSeat: number
  trick: { cards: Card[]; bySeat: number } | null // current table play (null = lead)
  passed: number[]                        // seats that passed in the current trick
  playedCount: Record<number, number>     // cards each seat has played (0 ⇒ cóng)
  cutEvents: CutEvent[]                    // chặt log for đền + the "Chặt!" UI
  mustIncludeThreeSpade: boolean          // round-1 opening must contain 3♠
  status: 'playing' | 'ended'
  winner: number | null                   // the Nhất (first player out / tới trắng)
  instantWin: { seat: number; type: InstantWinType } | null
  deltas: Record<number, number> | null   // per-seat settlement once status='ended'
}

export type PlayResult = { ok: true; state: RoundState } | { ok: false; error: string }

// ── Card helpers ─────────────────────────────────────────────────────────────────
function removeCards(hand: Card[], cards: Card[]): Card[] | null {
  const out = hand.slice()
  for (const c of cards) {
    const i = out.findIndex(h => cardsEqual(h, c))
    if (i < 0) return null // a card not actually held — rejected
    out.splice(i, 1)
  }
  return out
}

function tableCombo(state: RoundState): Combo | null {
  if (!state.trick) return null
  return parseCombo(state.trick.cards)
}

// ── Deal ──────────────────────────────────────────────────────────────────────────
// Shuffle a 52-card deck (Fisher–Yates over the injected rng) and deal 13 to each
// seat. The remainder (when <4 players) is dropped and never returned. Round 1 →
// the 3♠ holder leads & must open with it; if 3♠ is undealt, the lowest-card holder
// leads with no 3♠ requirement. Later rounds → previousWinner leads. Immediately
// runs the tới-trắng check; a qualifying hand ends the round at once.
export function dealRound(opts: {
  seats: number[]
  roundNo: number
  rules: Rules
  rng?: () => number
  previousWinner?: number | null
  deck?: Card[] // test/replay injection — skips the shuffle when provided
}): RoundState {
  const { seats, roundNo, rules, rng = Math.random } = opts
  const ordered = [...seats].sort((a, b) => a - b)
  const deck = opts.deck ?? shuffle(createDeck(), rng)

  const hands: Record<number, Card[]> = {}
  const playedCount: Record<number, number> = {}
  ordered.forEach((seat, i) => {
    hands[seat] = sortHand(deck.slice(i * 13, i * 13 + 13))
    playedCount[seat] = 0
  })

  // Lead seat + opening requirement.
  let turnSeat: number
  let mustIncludeThreeSpade = false
  if (roundNo <= 1) {
    const holder = ordered.find(s => hands[s].some(c => c.rank === R3 && c.suit === SUIT_SPADE))
    if (holder !== undefined) {
      turnSeat = holder
      mustIncludeThreeSpade = true
    } else {
      turnSeat = lowestCardSeatOf(hands, ordered)
    }
  } else {
    turnSeat = opts.previousWinner != null && ordered.includes(opts.previousWinner)
      ? opts.previousWinner
      : lowestCardSeatOf(hands, ordered)
  }

  const state: RoundState = {
    seats: ordered,
    roundNo,
    rules,
    hands,
    turnSeat,
    trick: null,
    passed: [],
    playedCount,
    cutEvents: [],
    mustIncludeThreeSpade,
    status: 'playing',
    winner: null,
    instantWin: null,
    deltas: null,
  }

  // ── Tới trắng: round ends instantly on a qualifying dealt hand. ───────────────
  if (rules.toiTrangEnabled) {
    let best: { seat: number; type: InstantWinType; strength: number } | null = null
    for (const s of ordered) {
      const iw = checkInstantWin(hands[s], rules)
      if (!iw) continue
      const cat = rules.instantWinOrder.indexOf(iw.type)
      const str = instantWinStrength(hands[s], iw.type)
      if (!best) { best = { seat: s, type: iw.type, strength: str }; continue }
      const bestCat = rules.instantWinOrder.indexOf(best.type)
      // §13.7: higher category first; same category → stronger hand; equal → lower seat
      // (seats are iterated ascending, so we only replace on a STRICT improvement).
      if (cat < bestCat || (cat === bestCat && str > best.strength)) {
        best = { seat: s, type: iw.type, strength: str }
      }
    }
    if (best) {
      state.instantWin = { seat: best.seat, type: best.type }
      state.winner = best.seat
      state.status = 'ended'
      state.deltas = settleRound(buildSettlement(state), rules)
    }
  }

  return state
}

function lowestCardSeatOf(hands: Record<number, Card[]>, seats: number[]): number {
  let best = seats[0]
  let bestStrength = Infinity
  for (const s of seats) for (const c of hands[s]) {
    if (strength(c) < bestStrength) { bestStrength = strength(c); best = s }
  }
  return best
}

// ── Turn advancement ───────────────────────────────────────────────────────────────
// First seat after `from` (circular) that has NOT passed this trick. Since the round
// ends on the first player out (endOnFirstOut), every participating seat is always
// still in play, so we only skip `passed`. Returns null when everyone else passed.
function nextSeatNotPassed(state: RoundState, from: number): number | null {
  const order = state.seats
  const startIdx = order.indexOf(from)
  for (let step = 1; step <= order.length; step++) {
    const seat = order[(startIdx + step) % order.length]
    if (seat === from) break
    if (!state.passed.includes(seat)) return seat
  }
  return null
}

// ── Play ───────────────────────────────────────────────────────────────────────────
export function applyPlay(state: RoundState, seat: number, cards: Card[]): PlayResult {
  if (state.status !== 'playing') return { ok: false, error: 'round_over' }
  if (seat !== state.turnSeat) return { ok: false, error: 'not_your_turn' }
  if (!cards.length) return { ok: false, error: 'no_cards' }

  const remaining = removeCards(state.hands[seat], cards)
  if (!remaining) return { ok: false, error: 'cards_not_held' }

  const combo = parseCombo(cards)
  if (!combo) return { ok: false, error: 'invalid_combo' }

  const table = tableCombo(state)

  // Round-1 opening must contain 3♠ (only enforced on the very first lead).
  if (state.mustIncludeThreeSpade && !table) {
    const hasThreeSpade = cards.some(c => c.rank === R3 && c.suit === SUIT_SPADE)
    if (!hasThreeSpade) return { ok: false, error: 'must_include_three_spade' }
  }

  if (!beats(combo, table, state.rules)) {
    // table is non-null here (a null table = leading is always legal) → granular reason.
    const reason = table ? explainBeat(combo, table, state.rules) : null
    return { ok: false, error: reason ?? 'illegal_move' }
  }

  // Detect a chặt (cross-type cut): legal but NOT same-shape ⇒ a bomb cut.
  const next = clone(state)
  if (table && !(combo.type === table.type && combo.count === table.count)) {
    const kind = table.type === 'single' && table.high.rank === R2 ? 'heo' : 'bom'
    next.cutEvents = [...state.cutEvents, { cutVictim: state.trick!.bySeat, cutter: seat, kind }]
  }

  next.hands[seat] = remaining
  next.playedCount[seat] = state.playedCount[seat] + cards.length
  next.trick = { cards: sortHand(cards), bySeat: seat }
  next.mustIncludeThreeSpade = false

  // First player out ⇒ round ends now (đếm-lá over the remaining hands).
  if (remaining.length === 0) {
    next.winner = seat
    next.status = 'ended'
    next.deltas = settleRound(buildSettlement(next), state.rules)
    return { ok: true, state: next }
  }

  // Advance: if everyone else has passed, this player wins the trick & leads anew.
  const after = nextSeatNotPassed(next, seat)
  if (after === null) {
    next.trick = null
    next.passed = []
    next.turnSeat = seat
  } else {
    next.turnSeat = after
  }
  return { ok: true, state: next }
}

// ── Pass ─────────────────────────────────────────────────────────────────────────
export function applyPass(state: RoundState, seat: number): PlayResult {
  if (state.status !== 'playing') return { ok: false, error: 'round_over' }
  if (seat !== state.turnSeat) return { ok: false, error: 'not_your_turn' }
  if (!state.trick) return { ok: false, error: 'cannot_pass_leading' }

  const next = clone(state)
  next.passed = [...state.passed, seat]
  const after = nextSeatNotPassed(next, seat)
  // Everyone but the trick owner has now passed ⇒ owner wins, leads a fresh trick.
  if (after === null || after === state.trick.bySeat) {
    next.trick = null
    next.passed = []
    next.turnSeat = state.trick.bySeat
  } else {
    next.turnSeat = after
  }
  return { ok: true, state: next }
}

// ── Timeout auto-move ──────────────────────────────────────────────────────────────
// Idle turn: auto-pass; or, if the player is leading and cannot pass, auto-play the
// lowest legal single. (When the 3♠ opening is pending the lowest single IS 3♠.)
export function applyTimeout(state: RoundState): PlayResult {
  if (state.status !== 'playing') return { ok: false, error: 'round_over' }
  const seat = state.turnSeat
  if (state.trick) return applyPass(state, seat)

  const singles = legalMoves(state.hands[seat], null, state.rules)
    .filter(c => c.type === 'single')
    .sort((a, b) => strength(a.high) - strength(b.high))
  if (!singles.length) return { ok: false, error: 'no_legal_single' }
  return applyPlay(state, seat, singles[0].cards)
}

// ── Settlement bridge ──────────────────────────────────────────────────────────────
function buildSettlement(state: RoundState): SettlementState {
  return {
    seats: state.seats,
    winner: state.winner ?? state.seats[0],
    hands: state.hands,
    playedCount: state.playedCount,
    cutEvents: state.cutEvents,
    instantWin: state.instantWin,
  }
}

// ── Public projection ──────────────────────────────────────────────────────────────
// The card COUNTS every client may see — never the cards themselves.
export function cardCounts(state: RoundState): Record<number, number> {
  const out: Record<number, number> = {}
  for (const s of state.seats) out[s] = state.hands[s].length
  return out
}

function clone(state: RoundState): RoundState {
  const hands: Record<number, Card[]> = {}
  for (const s of state.seats) hands[s] = state.hands[s].slice()
  return {
    ...state,
    rules: { ...state.rules, instantWinOrder: [...state.rules.instantWinOrder], bombs: { ...state.rules.bombs } },
    hands,
    trick: state.trick ? { cards: state.trick.cards.slice(), bySeat: state.trick.bySeat } : null,
    passed: [...state.passed],
    playedCount: { ...state.playedCount },
    cutEvents: state.cutEvents.map(e => ({ ...e })),
    deltas: state.deltas ? { ...state.deltas } : null,
    instantWin: state.instantWin ? { ...state.instantWin } : null,
  }
}

export { resolveRules }
