// ─────────────────────────────────────────────────────────────────────────────
// PolicyView construction — the fairness boundary.
//
// policyViewFromRound() is the ONLY adapter from the server-internal RoundState
// (which contains every secret hand) to the PUBLIC PolicyView the bot policy is
// allowed to see. It copies the bot's OWN hand and, for opponents, ONLY their card
// COUNT and public flags — never their card identities. ai.fairness.test.ts proves
// no opponent card leaks through. seenCards defaults to the current trick (the only
// log RoundState carries); the simulator may pass the full public play log.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, type Combo, parseCombo } from '../engine.ts'
import { type RoundState } from '../round.ts'
import { type PolicyView, type OpponentPublic } from './types.ts'
import { tableToMove } from './legalMoves.ts'

/** The engine Combo currently on the table (null = leading). */
export function tableComboFromView(view: PolicyView): Combo | null {
  if (!view.table) return null
  return parseCombo(view.table.cards)
}

/** Next seat in play order after `from` that has not passed (who acts right after us). */
function nextActiveSeat(seats: number[], from: number, passed: number[]): number | null {
  const i = seats.indexOf(from)
  for (let step = 1; step <= seats.length; step++) {
    const s = seats[(i + step) % seats.length]
    if (s === from) break
    if (!passed.includes(s)) return s
  }
  return null
}

export function policyViewFromRound(
  state: RoundState,
  seat: number,
  seenCards?: Card[],
): PolicyView {
  const rules = state.rules
  const table = state.trick ? tableToMove(state.trick.cards, rules) : null
  const nextSeat = nextActiveSeat(state.seats, seat, state.passed)

  const opponents: OpponentPublic[] = state.seats
    .filter(s => s !== seat)
    .map(s => ({
      seat: s,
      cardsLeft: (state.hands[s] ?? []).length, // COUNT ONLY — never the cards
      actsBeforeMeNext: s === nextSeat,
      passedThisTrick: state.passed.includes(s),
    }))

  return {
    mySeat: seat,
    myHand: (state.hands[seat] ?? []).slice(),
    table,
    trickBySeat: state.trick ? state.trick.bySeat : null,
    mustIncludeThreeSpade: state.mustIncludeThreeSpade,
    rules,
    opponents,
    seenCards: (seenCards ?? state.trick?.cards ?? []).slice(),
    playedCounts: { ...state.playedCount },
  }
}
