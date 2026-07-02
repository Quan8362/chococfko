// ── Poker CONTEXTUAL HELP + POST-HAND explanation (pure, authoritative, reveal-safe) ──────────
//
// PURE — no React, no Supabase, no strings baked in. Tested by explain.test.ts. Every explanation
// is derived from AUTHORITATIVE state (the server/engine's LegalActionModel and ShowdownResult),
// never from a guess, and is keyed to a canonical engine rule ID (docs/poker/rules/
// engine-rule-specification.md) plus a machine `code` the UI maps to localized text. This is the
// backbone of the "Why can't I …?" tips and the after-hand breakdown.
//
// 🔴 REVEAL-SAFETY: the post-hand explanation is built ONLY from the ShowdownResult's `reveal`
// (non-mucking contenders) + the revealed board. It NEVER reaches for a folded/mucked player's
// cards — those are not present in its inputs, so it cannot leak them (SECURITY-HOLE-CARDS-001).

import type { Card, Rank, PokerActionType } from '../types.ts'
import type { LegalActionModel } from '../hand.ts'
import type { ShowdownResult } from '../showdown.ts'
import { evaluateHand, describeHand, HandCategory, type HandCategory as HandCategoryT } from '../evaluator.ts'

// ── 1. Contextual "why can't I …?" resolver ───────────────────────────────────────────────────
export type ActionAvailabilityCode =
  | 'available'
  | 'check_blocked_by_bet' // you owe chips to stay in, so you can't check for free
  | 'bet_blocked_existing_bet' // there's already a bet this street — you would RAISE, not bet
  | 'raise_not_reopened' // action wasn't re-opened (a short all-in didn't fully raise)
  | 'raise_no_chips' // you have nothing left behind your call
  | 'call_would_be_all_in' // calling costs your whole stack (informational; call is still legal)

export interface ActionExplanation {
  readonly code: ActionAvailabilityCode
  readonly ruleId: string
  readonly params: Readonly<Record<string, number>>
}

// Would calling cost the player their entire remaining stack? (ALLIN-CALLSHORT-001)
export function callIsAllIn(model: LegalActionModel): boolean {
  return model.callAmount > 0 && model.callAmount >= model.remainingStack
}

export function explainWhyNot(model: LegalActionModel, action: PokerActionType): ActionExplanation {
  const allowed = model.allowed.includes(action)
  switch (action) {
    case 'check':
      if (allowed) return { code: 'available', ruleId: 'ACTION-CHECK-001', params: {} }
      return { code: 'check_blocked_by_bet', ruleId: 'ACTION-CHECK-001', params: { callAmount: model.callAmount } }
    case 'call':
      if (callIsAllIn(model)) {
        return { code: 'call_would_be_all_in', ruleId: 'ALLIN-CALLSHORT-001', params: { callAmount: model.callAmount, remainingStack: model.remainingStack } }
      }
      return { code: 'available', ruleId: 'ACTION-CALL-001', params: { callAmount: model.callAmount } }
    case 'bet':
      if (allowed) return { code: 'available', ruleId: 'ACTION-BET-001', params: { minOpeningBet: model.minOpeningBet } }
      return { code: 'bet_blocked_existing_bet', ruleId: 'ACTION-BET-001', params: { callAmount: model.callAmount } }
    case 'raise':
      if (allowed) return { code: 'available', ruleId: 'RAISE-MIN-001', params: { minRaiseTo: model.minRaiseTo, maxRaiseTo: model.maxRaiseTo } }
      if (model.remainingStack <= model.callAmount) {
        return { code: 'raise_no_chips', ruleId: 'RAISE-REOPEN-001', params: { remainingStack: model.remainingStack, callAmount: model.callAmount } }
      }
      return { code: 'raise_not_reopened', ruleId: 'RAISE-REOPEN-001', params: {} }
    default:
      return { code: 'available', ruleId: 'ACTION-CHECK-001', params: {} }
  }
}

// The minimum-raise explanation (RAISE-MIN-001): the smallest legal "raise to" total and the
// increment that produced it. `increment` = minRaiseTo − (what a call would total).
export interface MinRaiseExplanation {
  readonly ruleId: 'RAISE-MIN-001'
  readonly minRaiseTo: number
  readonly maxRaiseTo: number
  readonly callTotal: number // total this-street commitment if you only called
  readonly increment: number // the minimum raise step over the current bet
}

export function explainMinRaise(model: LegalActionModel): MinRaiseExplanation {
  const callTotal = model.currentStreetContribution + model.callAmount
  return {
    ruleId: 'RAISE-MIN-001',
    minRaiseTo: model.minRaiseTo,
    maxRaiseTo: model.maxRaiseTo,
    callTotal,
    increment: Math.max(0, model.minRaiseTo - callTotal),
  }
}

// ── 2. Contextual-help topic registry (the "optional help" panel) ─────────────────────────────
// Each first-time question the spec calls out, mapped to a rule ID and a machine key the UI
// localizes. `dynamic` topics are also answerable from live state via the resolvers above; the
// rest (timeout/sit-out) are stable rule references shown as static help.
export const HELP_TOPICS = [
  { key: 'why_no_check', ruleId: 'ACTION-CHECK-001', dynamic: true },
  { key: 'why_no_raise', ruleId: 'RAISE-REOPEN-001', dynamic: true },
  { key: 'min_raise', ruleId: 'RAISE-MIN-001', dynamic: true },
  { key: 'call_all_in', ruleId: 'ALLIN-CALLSHORT-001', dynamic: true },
  { key: 'bet_returned', ruleId: 'POT-UNCALLED-001', dynamic: true },
  { key: 'won_main_pot', ruleId: 'POT-MAIN-001', dynamic: true },
  { key: 'won_side_pot', ruleId: 'POT-SIDE-001', dynamic: true },
  { key: 'pot_split', ruleId: 'HAND-EXACT-TIE-001', dynamic: true },
  { key: 'board_played', ruleId: 'HAND-INV-003', dynamic: true },
  { key: 'auto_folded', ruleId: 'TIMEOUT-FOLD-001', dynamic: false },
  { key: 'sitting_out', ruleId: 'SITOUT-001', dynamic: false },
] as const

export type HelpTopicKey = (typeof HELP_TOPICS)[number]['key']

// ── 3. Post-hand explanation (reveal-safe) ─────────────────────────────────────────────────────
export interface PotExplanation {
  readonly potIndex: number
  readonly kind: 'main' | 'side'
  readonly amount: number
  readonly winners: readonly number[] // seat indexes
  readonly split: boolean
  readonly categoryLabel: string | null // machine label ('two_pair' …) or null (won without showdown)
  readonly category: HandCategoryT | null
  readonly bestFive: readonly Card[] // revealed winning five (from reveal + board only)
  readonly boardPlays: boolean // the best five come entirely from the community board
  readonly kickerRank: Rank | null // the deciding side card when a pair/high-card decided it
}

export interface ShowdownExplanation {
  readonly wentToShowdown: boolean
  readonly pots: readonly PotExplanation[]
  readonly refund: { readonly seatIndex: number; readonly amount: number } | null
  // pass-through of the LEGALLY revealed contenders — the ONLY cards the UI may render face-up
  readonly reveal: readonly { readonly seatIndex: number; readonly cards: readonly [Card, Card] }[]
}

function kickerFor(category: HandCategoryT, tiebreakerRanks: readonly Rank[]): Rank | null {
  // A "kicker decides" story is most meaningful for a single pair (side card at index 1) or a bare
  // high card (top card). Two pair's kicker is index 2. Anything else has no lone deciding kicker.
  if (category === HandCategory.Pair) return tiebreakerRanks[1] ?? null
  if (category === HandCategory.TwoPair) return tiebreakerRanks[2] ?? null
  if (category === HandCategory.HighCard) return tiebreakerRanks[0] ?? null
  return null
}

export function explainShowdown(result: ShowdownResult, board: readonly Card[]): ShowdownExplanation {
  const revealBySeat = new Map<number, readonly [Card, Card]>()
  for (const r of result.reveal) revealBySeat.set(r.seatIndex, r.cards)
  const boardSet = new Set<string>(board)

  const pots: PotExplanation[] = result.pots.map((pot, i) => {
    const winners = result.winnersByPot[i] ?? []
    const kind: 'main' | 'side' = i === 0 ? 'main' : 'side'

    // Evaluate the winning hand from a winner's REVEALED cards (winners always show). If the pot
    // was won without a showdown, there is no revealed hand to describe.
    let category: HandCategoryT | null = null
    let categoryLabel: string | null = null
    let bestFive: readonly Card[] = []
    let boardPlays = false
    let kickerRank: Rank | null = null

    const firstWinnerCards = winners.length > 0 ? revealBySeat.get(winners[0]) : undefined
    if (result.wentToShowdown && firstWinnerCards && board.length >= 3) {
      const value = evaluateHand(firstWinnerCards, board)
      const meta = describeHand(value)
      category = value.category
      categoryLabel = meta.label
      bestFive = value.bestFive
      boardPlays = value.bestFive.every((c) => boardSet.has(c))
      kickerRank = kickerFor(value.category, meta.tiebreakerRanks)
    }

    return {
      potIndex: i,
      kind,
      amount: pot.amount,
      winners,
      split: winners.length > 1,
      categoryLabel,
      category,
      bestFive,
      boardPlays,
      kickerRank,
    }
  })

  return {
    wentToShowdown: result.wentToShowdown,
    pots,
    refund: result.refund ? { seatIndex: result.refund.seatIndex, amount: result.refund.amount } : null,
    reveal: result.reveal.map((r) => ({ seatIndex: r.seatIndex, cards: r.cards })),
  }
}
