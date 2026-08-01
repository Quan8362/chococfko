// Pure geometry for the PUBLIC mirrored knockout bracket. No React, no DOM — deterministic transforms
// over the server-computed KnockoutRoundView[] so the visual layout can be unit-tested and can never
// disagree with the generator (Prompt 4A). The component (components/tournaments/public/PublicBracket)
// consumes these + measures real DOM node positions to draw connectors; the winner-advancement graph
// itself is decided here, structurally, from the same round shape the engine produced.
//
// `rounds` is always ascending: rounds[0] is the first round (most matches), the last entry is the
// final (one match). A standard single-elimination bracket halves its match count each round, so
// round r match i is fed by round r-1 matches 2i and 2i+1.

import type { KnockoutRoundView } from '../admin/types.ts'

export type BracketSide = 'left' | 'right' | 'center'

export interface BracketColumn {
  // Stable key for React + connector lookups (side-tagged so a split round yields two distinct keys).
  key: string
  label: string
  roundNumber: number
  side: BracketSide
  matches: KnockoutRoundView['matches']
}

// A winner-advancement edge: the winner of `from` plays in `to`. Used to draw connectors and to label
// unresolved slots ("Thắng trận N").
export interface BracketEdge {
  from: string // feeder match id
  to: string // consumer match id
}

/**
 * Arrange the rounds into mirrored columns for the desktop symmetric view:
 *   [left r0 … left r(n-1)]  [center: final]  [right r(n-1) … right r0]
 * The final is always the single centre column. Every earlier round is split down the middle: its
 * first half feeds the left side, its second half the right side (consistent across rounds because
 * match i is fed by 2i/2i+1, so the first half of round r is always fed by the first half of r-1).
 * With one round only (a 2-competitor final) the result is just the centre column.
 */
export function mirroredColumns(rounds: KnockoutRoundView[]): BracketColumn[] {
  if (rounds.length === 0) return []
  const finalRound = rounds[rounds.length - 1]
  const splitRounds = rounds.slice(0, -1)

  const left: BracketColumn[] = []
  const right: BracketColumn[] = []
  for (const r of splitRounds) {
    const mid = Math.ceil(r.matches.length / 2)
    left.push({ key: `L${r.roundNumber}`, label: r.label, roundNumber: r.roundNumber, side: 'left', matches: r.matches.slice(0, mid) })
    right.push({ key: `R${r.roundNumber}`, label: r.label, roundNumber: r.roundNumber, side: 'right', matches: r.matches.slice(mid) })
  }
  const center: BracketColumn = {
    key: 'C',
    label: finalRound.label,
    roundNumber: finalRound.roundNumber,
    side: 'center',
    matches: finalRound.matches,
  }
  // Left ascending (r0 far left → toward centre); right descending so r0 lands on the far right,
  // mirroring the left side toward the centre final.
  return [...left, center, ...right.reverse()]
}

/** The winner-advancement graph, derived structurally from the round shape. */
export function bracketEdges(rounds: KnockoutRoundView[]): BracketEdge[] {
  const edges: BracketEdge[] = []
  for (let r = 1; r < rounds.length; r++) {
    const prev = rounds[r - 1].matches
    rounds[r].matches.forEach((m, i) => {
      const a = prev[2 * i]
      const b = prev[2 * i + 1]
      if (a) edges.push({ from: a.id, to: m.id })
      if (b) edges.push({ from: b.id, to: m.id })
    })
  }
  return edges
}

// Which match number feeds each slot of a match, so an unresolved slot can be labelled "Thắng trận N"
// instead of a bare "Chưa xác định". Round-0 matches have no feeders (they are the entry round).
export interface SlotFeeders {
  a?: number
  b?: number
}

export function feederMap(rounds: KnockoutRoundView[]): Map<string, SlotFeeders> {
  const map = new Map<string, SlotFeeders>()
  for (let r = 1; r < rounds.length; r++) {
    const prev = rounds[r - 1].matches
    rounds[r].matches.forEach((m, i) => {
      map.set(m.id, { a: prev[2 * i]?.matchNumber, b: prev[2 * i + 1]?.matchNumber })
    })
  }
  return map
}

// The nominal bracket size (next power of two ≥ competitor slots) inferred from round 0. Two entrants
// per first-round match. Useful for the "Nhánh N suất" summary heading.
export function bracketSize(rounds: KnockoutRoundView[]): number {
  if (rounds.length === 0) return 0
  return rounds[0].matches.length * 2
}
