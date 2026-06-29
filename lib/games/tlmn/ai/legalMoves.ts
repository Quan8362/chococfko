// ─────────────────────────────────────────────────────────────────────────────
// Legal-move generation — the SINGLE generator used by production, tests,
// simulator, and scenarios. It is a thin canonicalising adapter over the
// authoritative engine (enumerateCombos / legalMoves / beats), NOT a second rule
// engine. Reusing the engine guarantees the AI can never consider an illegal move.
// ─────────────────────────────────────────────────────────────────────────────
import {
  type Card, type Combo, type Rules,
  R3, SUIT_SPADE,
  toCode, enumerateCombos, beats, parseCombo, isBomb as engineIsBomb,
} from '../engine.ts'
import { type LegalMove } from './types.ts'

/** Stable canonical id for a move: sorted card codes. Dedups equivalent moves. */
export function canonicalId(cards: Card[]): string {
  return cards.map(toCode).sort().join(',')
}

function toLegalMove(c: Combo, table: Combo | null, rules: Rules): LegalMove {
  return {
    id: canonicalId(c.cards),
    cards: c.cards,
    combinationType: c.type,
    primaryRank: c.high.rank,
    cardCount: c.count,
    isBomb: engineIsBomb(c),
    beatsCurrentPlay: beats(c, table, rules),
  }
}

/**
 * All legal candidates from `hand` against `table` (null = leading). Deduplicated by
 * canonical id. When `mustIncludeThreeSpade` (round-1 opening) and leading, only
 * moves containing 3♠ are returned — matching the engine's opening constraint.
 */
export function buildLegalMoves(
  hand: Card[],
  table: Combo | null,
  rules: Rules,
  mustIncludeThreeSpade = false,
): LegalMove[] {
  const all = enumerateCombos(hand)
  const out: LegalMove[] = []
  const seen = new Set<string>()
  for (const c of all) {
    if (!beats(c, table, rules)) continue
    if (mustIncludeThreeSpade && !table &&
        !c.cards.some(card => card.rank === R3 && card.suit === SUIT_SPADE)) continue
    const lm = toLegalMove(c, table, rules)
    if (seen.has(lm.id)) continue
    seen.add(lm.id)
    out.push(lm)
  }
  return out
}

/** Parse a played card set back into a comparable LegalMove (or null if invalid). */
export function tableToMove(cards: Card[] | null, rules: Rules): LegalMove | null {
  if (!cards || cards.length === 0) return null
  const combo = parseCombo(cards)
  if (!combo) return null
  return toLegalMove(combo, null, rules)
}
