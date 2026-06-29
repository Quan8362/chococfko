// ─────────────────────────────────────────────────────────────────────────────
// Danger-level classification — drives mode switching in scoring + search.
//
//   normal   — no one is close to finishing.
//   caution  — an opponent is getting low (≤3) or we are.
//   critical — an opponent has 1 card, OR 2 cards while controlling the trick.
//   endgame  — few total cards remain → deeper search becomes worthwhile.
//
// Public-information only (card counts + who controls the trick).
// ─────────────────────────────────────────────────────────────────────────────
import { type DangerLevel, type PolicyView } from './types.ts'

export interface DangerAssessment {
  level: DangerLevel
  minOpponentCards: number
  dangerousOpponentActsNext: boolean // a low opponent acts before our next turn
  oneCardOpponent: boolean
  totalCardsInPlay: number
}

// Thresholds (kept here, documented, not scattered as magic numbers).
export const CAUTION_OPP_CARDS = 3
export const ENDGAME_TOTAL_CARDS = 14 // total across all seats → consider deeper search

export function assessDanger(view: PolicyView): DangerAssessment {
  const oppCards = view.opponents.map(o => o.cardsLeft)
  const minOpponentCards = oppCards.length ? Math.min(...oppCards) : Infinity
  const oneCardOpponent = oppCards.some(n => n === 1)
  const dangerousOpponentActsNext = view.opponents.some(o => o.cardsLeft <= CAUTION_OPP_CARDS && o.actsBeforeMeNext)
  const totalCardsInPlay = view.myHand.length + oppCards.reduce((a, b) => a + b, 0)

  // Whoever controls the current trick: if an opponent owns it and is on 2, that is
  // acutely dangerous (they re-lead and may finish).
  const dangerousController = view.opponents.some(o => o.cardsLeft <= 2 && view.trickBySeat === o.seat)

  let level: DangerLevel = 'normal'
  if (minOpponentCards <= CAUTION_OPP_CARDS || view.myHand.length <= 4) level = 'caution'
  if (oneCardOpponent || dangerousController) level = 'critical'
  if (totalCardsInPlay <= ENDGAME_TOTAL_CARDS || view.myHand.length <= 7 || minOpponentCards <= 4) {
    // endgame is the "search deeper" trigger; critical (acute threat) outranks it for scoring mode.
    level = level === 'critical' ? 'critical' : 'endgame'
  }

  return { level, minOpponentCards, dangerousOpponentActsNext, oneCardOpponent, totalCardsInPlay }
}
