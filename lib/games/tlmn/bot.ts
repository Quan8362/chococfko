// ─────────────────────────────────────────────────────────────────────────────
// Tiến Lên Miền Nam — pure BOT AI (Phase 5).
//
// Framework-agnostic like engine.ts / round.ts: NO React / Supabase / next imports.
// `chooseBotMove` ALWAYS returns a move the engine accepts — it picks exclusively
// from `legalMoves` (and the round-1 3♠ opening constraint), so a bot can never
// produce an illegal play. The realtime action drives this and commits through the
// SAME server validation a human goes through.
//
// Strategy (kept simple & deterministic so it is unit-testable):
//   • Leading — evaluate EVERY legal shape (single/pair/triple/sảnh/đôi-thông/tứ-quý)
//     and choose the one that best tidies the hand: it minimises the estimated number
//     of remaining turns, prefers shedding LOW cards, and keeps 2s + bombs in reserve.
//     This is why the bot leads pairs / triples / straights — not just singles.
//   • Following — play the lowest legal combo that beats the table (same shape, or a
//     bomb cut); pass rather than burn a 2/bomb early; near the endgame spend 2s/bombs
//     to go out or to deny an opponent who is on their last cards.
//   • Defending — when an opponent is on their LAST card while we lead, switch to a
//     hard-to-beat multi-card / high lead so they cannot dump and go out.
// ─────────────────────────────────────────────────────────────────────────────
import {
  type Card, type Combo, type Rules,
  R2, R3, RANKS, SUIT_SPADE,
  strength, toCode, parseCombo, legalMoves,
} from './engine.ts'
import { type RoundState } from './round.ts'

export type BotMove = { type: 'play'; cards: Card[] } | { type: 'pass' }

// A "bomb" (chặt-capable bộ): tứ quý or a 3+-pair đôi-thông.
function isBomb(c: Combo): boolean {
  return c.type === 'four' || (c.type === 'pairsRun' && c.count >= 6)
}
function hasTwo(c: Combo): boolean {
  return c.cards.some(card => card.rank === R2)
}
// "Premium" = a resource we'd rather not spend early: a 2 (heo) or a bomb.
function isPremium(c: Combo): boolean {
  return isBomb(c) || hasTwo(c)
}

// Lower = play sooner. Non-premium combos rank purely by their high card; 2s and
// bombs are pushed far back so they are only chosen when nothing cheaper exists.
// Used by the FOLLOWING path, where every candidate is the same shape (or a bomb),
// so "lowest beat" is exactly the cheapest combo that clears the table.
function moveCost(c: Combo): number {
  let cost = strength(c.high)
  if (hasTwo(c)) cost += 1000
  if (isBomb(c)) cost += 5000
  return cost
}

function pickLowest(moves: Combo[]): Combo {
  return moves.slice().sort((a, b) => moveCost(a) - moveCost(b) || a.count - b.count)[0]
}

// ── Leading evaluation ────────────────────────────────────────────────────────
// The bug this replaces: leading used pickLowest (sort by strength(high)), so the
// absolute lowest single ALWAYS won — the bot never led a pair/triple/straight.
// Instead we score the whole RESULTING hand: a good lead leaves a hand that needs
// fewer future turns to empty, while shedding low cards and conserving reserves.

function without(hand: Card[], combo: Combo): Card[] {
  const out = hand.slice()
  for (const c of combo.cards) {
    const i = out.findIndex(h => h.rank === c.rank && h.suit === c.suit)
    if (i >= 0) out.splice(i, 1)
  }
  return out
}

// Estimated number of plays needed to empty `cards` if unobstructed (lower = better):
// each rank held ≥2 is one grouped play (pair/triple/tứ quý kept intact); leftover
// singles are then packed greedily into sảnh (≥3 consecutive ranks, never the 2),
// and any remaining lone card is its own play. This is the "estimated future turns
// remaining" factor — it rewards keeping pairs/triples/runs together and punishes
// fragmenting a group (e.g. leading one card out of a triple leaves a worse hand).
function residualMoves(cards: Card[]): number {
  const counts = new Array(RANKS.length).fill(0)
  for (const c of cards) counts[c.rank]++

  let moves = 0
  const singleRanks: number[] = []
  for (let r = 0; r < counts.length; r++) {
    if (counts[r] >= 2) moves += 1 // pair / triple / tứ quý → one grouped play
    else if (counts[r] === 1) singleRanks.push(r)
  }

  // Pack leftover singles into straights (≥3 consecutive ranks, excluding the 2).
  let i = 0
  while (i < singleRanks.length) {
    let j = i
    while (
      j + 1 < singleRanks.length &&
      singleRanks[j + 1] === singleRanks[j] + 1 &&
      singleRanks[j] !== R2 && singleRanks[j + 1] !== R2
    ) j++
    const runLen = j - i + 1
    if (runLen >= 3 && singleRanks[i] !== R2) { moves += 1; i = j + 1 }
    else { moves += 1; i += 1 }
  }
  return moves
}

// Leading-move weights. residualMoves dominates so the bot optimises the SHAPE of
// what it keeps; the high-card term is a gentle "shed low first" nudge; the shed
// bonus mildly favours clearing more cards per turn.
const W_MOVES = 12 // estimated future turns remaining (primary)
const W_HIGH = 1   // prefer leading low cards (rank only, 0..12)
const W_SHED = 2   // mild efficiency reward for shedding more cards now

// Higher = a better lead. `dangerous` flips strategy to pure denial.
function leadScore(hand: Card[], c: Combo, dangerous: boolean): number {
  const residual = residualMoves(without(hand, c))
  if (dangerous) {
    // An opponent is on their last card while we lead: play something they cannot
    // beat so they can't dump it. Multi-card and high leads score highest; keeping
    // reserves no longer matters. (full strength incl. suit → deterministic.)
    return c.count * 100 + strength(c.high) - residual
  }
  return -W_MOVES * residual - W_HIGH * c.high.rank + W_SHED * (c.count - 1)
}

function pickLead(hand: Card[], pool: Combo[], dangerous: boolean): Combo {
  const scored = pool.map(c => ({ c, s: leadScore(hand, c, dangerous) }))
  scored.sort((a, b) =>
    b.s - a.s ||
    // Deterministic tie-breaks: lower high card, then fewer cards, then canonical.
    strength(a.c.high) - strength(b.c.high) ||
    a.c.count - b.c.count ||
    cardsKey(a.c).localeCompare(cardsKey(b.c)),
  )
  return scored[0].c
}

function cardsKey(c: Combo): string {
  return c.cards.map(toCode).sort().join(',')
}

// How small an opponent's hand must be (or our own) before we start spending
// reserves while following.
const ENDGAME_OPP_CARDS = 2
const ENDGAME_MY_CARDS = 4

export function chooseBotMove(state: RoundState, seat: number): BotMove {
  const hand = state.hands[seat] ?? []
  const rules: Rules = state.rules
  const table: Combo | null = state.trick ? parseCombo(state.trick.cards) : null

  let moves = legalMoves(hand, table, rules)

  // Round-1 opening must contain 3♠ (engine enforces it; legalMoves doesn't filter).
  if (state.mustIncludeThreeSpade && !table) {
    moves = moves.filter(m => m.cards.some(c => c.rank === R3 && c.suit === SUIT_SPADE))
  }

  // Following with nothing that beats the table → pass (always legal here).
  if (moves.length === 0) return { type: 'pass' }

  // Always take a move that empties our hand (going out wins the round). This is also
  // how the bot voluntarily plays a tứ quý / đôi-thông / sảnh as its final move.
  const goOut = moves.filter(m => m.count === hand.length)
  if (goOut.length) return { type: 'play', cards: pickLowest(goOut).cards }

  const others = state.seats.filter(s => s !== seat)
  const minOpp = others.length ? Math.min(...others.map(s => (state.hands[s] ?? []).length)) : Infinity

  if (!table) {
    // LEADING — we cannot pass. Evaluate every legal shape and choose the lead that
    // best tidies the hand (see leadScore). Keep 2s/bombs in reserve unless an
    // opponent is on their last card (then deny with a hard-to-beat lead).
    const dangerous = minOpp <= 1
    const nonPremium = moves.filter(m => !isPremium(m))
    const pool = (!dangerous && nonPremium.length) ? nonPremium : moves
    return { type: 'play', cards: pickLead(hand, pool, dangerous).cards }
  }

  // FOLLOWING — prefer the cheapest non-premium beat (lowest combo of the table's
  // shape: a higher pair on a pair, a higher sảnh on a sảnh, etc.).
  const nonPremium = moves.filter(m => !isPremium(m))
  if (nonPremium.length) return { type: 'play', cards: pickLowest(nonPremium).cards }

  // Only 2s/bombs can beat the table. Spend one only near the endgame (to go out,
  // already handled above, or to deny an opponent on their last cards); else pass.
  const endgame = minOpp <= ENDGAME_OPP_CARDS || hand.length <= ENDGAME_MY_CARDS
  if (endgame) return { type: 'play', cards: pickLowest(moves).cards }
  return { type: 'pass' }
}

// ── Development-only audit (no hidden human cards are ever exposed) ──────────────
// Mirrors chooseBotMove's decision and tallies what was generated/selected so a
// real run can distinguish a generator / selector / serialization bug. The bot only
// ever sees its OWN hand and the public table, so this leaks nothing secret. The
// caller appends `validationResult` after the engine validates the chosen move.
export type BotMoveType = 'single' | 'pair' | 'triple' | 'straight' | 'fourOfKind' | 'consecutivePairs' | 'other'
export type BotAudit = {
  botId: number
  hand: string[]
  currentTablePlay: string[] | null
  isLeadingNewTrick: boolean
  generatedMoveCount: number
  generatedMovesByType: Record<BotMoveType, number>
  legalMoves: Array<{ type: string; cards: string[] }>
  selectedMove: { type: 'play' | 'pass'; cards: string[] }
  selectedCombinationType: string | null
  submittedCardIds: string[]
}

function classify(c: Combo): BotMoveType {
  switch (c.type) {
    case 'single': return 'single'
    case 'pair': return 'pair'
    case 'triple': return 'triple'
    case 'straight': return 'straight'
    case 'four': return 'fourOfKind'
    case 'pairsRun': return 'consecutivePairs'
    default: return 'other'
  }
}

export function botMoveAudit(state: RoundState, seat: number): BotAudit {
  const hand = state.hands[seat] ?? []
  const table: Combo | null = state.trick ? parseCombo(state.trick.cards) : null
  const moves = legalMoves(hand, table, state.rules)

  const byType: Record<BotMoveType, number> = {
    single: 0, pair: 0, triple: 0, straight: 0, fourOfKind: 0, consecutivePairs: 0, other: 0,
  }
  for (const m of moves) byType[classify(m)]++

  const move = chooseBotMove(state, seat)
  const selectedCombo = move.type === 'play' ? parseCombo(move.cards) : null

  return {
    botId: seat,
    hand: hand.map(toCode),
    currentTablePlay: state.trick ? state.trick.cards.map(toCode) : null,
    isLeadingNewTrick: !state.trick,
    generatedMoveCount: moves.length,
    generatedMovesByType: byType,
    legalMoves: moves.map(m => ({ type: m.type, cards: m.cards.map(toCode) })),
    selectedMove: { type: move.type, cards: move.type === 'play' ? move.cards.map(toCode) : [] },
    selectedCombinationType: selectedCombo ? selectedCombo.type : null,
    submittedCardIds: move.type === 'play' ? move.cards.map(toCode) : [],
  }
}
