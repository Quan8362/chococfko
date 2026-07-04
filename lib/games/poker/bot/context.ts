// ── Poker BOT public-state context (pure, own+public only) ─────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Deterministic. Tested by context.test.ts.
//
// 🔴 FAIRNESS: derives ONLY from the fairness-bounded observation (public seat facts + the bot's
// own cards). It computes the public facts the strategy needs repeatedly — position, effective
// stack, stack-to-pot ratio, and the preflop situation — ONCE per decision (a "cached public-state
// classification", 27C-A performance plan), so the decision code does not re-walk the seat list in
// every branch. Nothing here uses hidden state; a human in the seat can read all of it off the felt.

import type { BotObservation } from './observation.ts'
import type { PositionClass, PreflopSituation } from './strategyConfig.ts'

export interface PublicContext {
  readonly seatCount: number // players dealt into this hand (public)
  readonly position: PositionClass
  readonly isButton: boolean
  readonly isSmallBlind: boolean
  readonly isBigBlind: boolean
  readonly inPosition: boolean // acts on or after every other in-hand seat postflop (public order)
  readonly ownStackBb: number // own chips behind, in big blinds
  readonly effectiveStackBb: number // min(own, largest in-hand opponent) total, in big blinds
  readonly spr: number // effective stack ÷ pot (stack-to-pot ratio); large when deep, small when shallow
  readonly opponents: number // other in-hand seats (>= 0)
  readonly multiway: boolean // 2+ opponents still contesting
  readonly preflop: PreflopSituation
  readonly preflopRaises: number // number of preflop bets/raises observed (0 = unopened)
  readonly isPreflopAggressor: boolean // this seat made the last preflop aggressive action
  readonly facingAllIn: boolean // an in-hand opponent is all-in AND we owe chips to continue
}

// Seat order helpers. `obs.seats` is ascending by seatIndex; the button sits at `obs.buttonSeat`.
// "Offset" = clockwise distance from the button among the dealt seats (button = 0, SB = 1, ...).
function seatOffsets(obs: BotObservation): { n: number; ownOffset: number } {
  const order = obs.seats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const n = order.length
  const btnIdx = order.indexOf(obs.buttonSeat)
  const myIdx = order.indexOf(obs.seatIndex)
  if (btnIdx < 0 || myIdx < 0) return { n, ownOffset: 0 }
  return { n, ownOffset: (myIdx - btnIdx + n) % n }
}

function positionFor(n: number, offset: number): PositionClass {
  if (n <= 2) return offset === 0 ? 'btn' : 'bb' // heads-up: button is the small blind
  if (offset === 0) return 'btn'
  if (offset === 1) return 'sb'
  if (offset === 2) return 'bb'
  if (offset === n - 1) return 'co'
  if (offset === 3) return 'ep'
  return 'mp'
}

// How many aggressive preflop actions occurred, and who made the last one — read from the public
// action history when the harness supplies it (the sim runner does). When it is empty (the practice
// server path currently passes no history), fall back to a COARSE inference from the betting state:
// currentBet at the big blind ⇒ unopened; a single raise level ⇒ one raise; a larger level ⇒ 3-bet+.
function preflopAggression(obs: BotObservation): { raises: number; lastAggressor: number | null } {
  const pf = obs.actionHistory.filter((e) => e.street === 'PREFLOP')
  if (pf.length > 0) {
    let raises = 0
    let last: number | null = null
    for (const e of pf) {
      if (e.type === 'bet' || e.type === 'raise' || e.type === 'all_in') {
        raises += 1
        last = e.seatIndex
      }
    }
    return { raises, lastAggressor: last }
  }
  // Historyless fallback (bounded, coarse — documented in the calibration plan §5).
  const bb = obs.bigBlind > 0 ? obs.bigBlind : 1
  if (obs.currentBet <= bb) return { raises: 0, lastAggressor: null }
  if (obs.currentBet <= bb * 3.5) return { raises: 1, lastAggressor: null }
  return { raises: 2, lastAggressor: null }
}

export function derivePublicContext(obs: BotObservation): PublicContext {
  const { n, ownOffset } = seatOffsets(obs)
  const position = positionFor(n, ownOffset)
  const isButton = position === 'btn'
  const isSmallBlind = n <= 2 ? isButton : position === 'sb'
  const isBigBlind = position === 'bb'

  const bb = obs.bigBlind > 0 ? obs.bigBlind : 1
  const self = obs.seats.find((s) => s.seatIndex === obs.seatIndex)
  const ownTotal = self ? self.stack + self.committedThisStreet : 0
  const ownStackBb = self ? self.stack / bb : 100

  const oppTotals = obs.seats
    .filter((s) => s.seatIndex !== obs.seatIndex && s.inHand)
    .map((s) => s.stack + s.committedThisStreet)
  const largestOpp = oppTotals.length > 0 ? Math.max(...oppTotals) : ownTotal
  const effectiveStackBb = Math.min(ownTotal, largestOpp) / bb

  const pot = obs.potTotal > 0 ? obs.potTotal : bb
  const effChips = Math.min(ownTotal, largestOpp)
  const spr = pot > 0 ? effChips / pot : effChips

  const opponents = obs.opponentsInHand
  const { raises, lastAggressor } = preflopAggression(obs)

  // Preflop situation: unopened/limped/raised/3bet+. A "limp" is a called-but-not-raised pot: nobody
  // has raised yet but someone voluntarily entered (approximated by any non-blind chips in with a
  // currentBet still at the big blind).
  let preflop: PreflopSituation
  if (obs.street !== 'PREFLOP') {
    preflop = raises >= 2 ? 'threebet_plus' : raises === 1 ? 'raised' : 'unopened'
  } else if (raises >= 2) preflop = 'threebet_plus'
  else if (raises === 1) preflop = 'raised'
  else {
    const limpers = obs.actionHistory.some((e) => e.street === 'PREFLOP' && e.type === 'call')
    preflop = limpers ? 'limped' : 'unopened'
  }

  const facingAllIn =
    obs.toCall > 0 && obs.seats.some((s) => s.seatIndex !== obs.seatIndex && s.status === 'allin')

  return {
    seatCount: n,
    position,
    isButton,
    isSmallBlind,
    isBigBlind,
    inPosition: isButton, // button always acts last postflop; a sufficient public proxy for "IP"
    ownStackBb,
    effectiveStackBb,
    spr,
    opponents,
    multiway: opponents >= 2,
    preflop,
    preflopRaises: raises,
    isPreflopAggressor: lastAggressor !== null && lastAggressor === obs.seatIndex,
    facingAllIn,
  }
}
