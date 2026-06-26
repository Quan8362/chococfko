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
//   • Leading — shed low singles/pairs first; keep 2s + bombs in reserve.
//   • Following — play the lowest legal combo that beats the table; pass rather
//     than burn a 2/bomb early; near the endgame spend 2s/bombs to go out or to
//     deny an opponent who is on their last cards.
// ─────────────────────────────────────────────────────────────────────────────
import {
  type Card, type Combo, type Rules,
  R2, R3, SUIT_SPADE,
  strength, parseCombo, legalMoves,
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
function moveCost(c: Combo): number {
  let cost = strength(c.high)
  if (hasTwo(c)) cost += 1000
  if (isBomb(c)) cost += 5000
  return cost
}

function pickLowest(moves: Combo[]): Combo {
  return moves.slice().sort((a, b) => moveCost(a) - moveCost(b) || a.count - b.count)[0]
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

  // Always take a move that empties our hand (going out wins the round).
  const goOut = moves.filter(m => m.count === hand.length)
  if (goOut.length) return { type: 'play', cards: pickLowest(goOut).cards }

  const nonPremium = moves.filter(m => !isPremium(m))

  if (!table) {
    // LEADING — we cannot pass. Prefer the lowest non-premium combo (shed low
    // singles/pairs first); only lead a 2/bomb when that's all we hold.
    const pool = nonPremium.length ? nonPremium : moves
    return { type: 'play', cards: pickLowest(pool).cards }
  }

  // FOLLOWING — prefer the cheapest non-premium beat.
  if (nonPremium.length) return { type: 'play', cards: pickLowest(nonPremium).cards }

  // Only 2s/bombs can beat the table. Spend one only near the endgame (to go out,
  // already handled above, or to deny an opponent on their last cards); else pass.
  const others = state.seats.filter(s => s !== seat)
  const minOpp = others.length ? Math.min(...others.map(s => (state.hands[s] ?? []).length)) : Infinity
  const endgame = minOpp <= ENDGAME_OPP_CARDS || hand.length <= ENDGAME_MY_CARDS
  if (endgame) return { type: 'play', cards: pickLowest(moves).cards }
  return { type: 'pass' }
}
