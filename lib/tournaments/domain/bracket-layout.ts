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

// Adaptive column sizing for the mirrored desktop board. The number of MIRRORED columns grows with the
// bracket depth: a 2-competitor final is 1 column, an 8-slot bracket is 5 ([QF SF]·2 + final), and a
// 16-slot bracket with a round-of-16 is 7 ([R16 QF SF]·2 + final). A single fixed card width that reads
// well at 5 columns overflows the reading shell at 7 (7·min + gaps exceeds the ~1216px content width),
// which — combined with a centred row — clips the outermost columns on BOTH sides. So the card floor,
// ceiling and gap all tighten as the column count rises, keeping every column inside the shell at
// desktop while a small bracket stays generously wide. Pure + unit-tested; the component only paints it.
//
// `compact` (6+ columns) tells the card to trim its horizontal padding so a ~128px column still reads.
export interface BracketColumnSizing {
  minWidth: number
  maxWidth: number
  gap: number
  compact: boolean
}

export function bracketColumnSizing(columnCount: number): BracketColumnSizing {
  // ≤3 columns (final, or final + one split round): roomy cards, centred with slack.
  if (columnCount <= 3) return { minWidth: 200, maxWidth: 264, gap: 28, compact: false }
  // 4–5 columns (up to an 8-slot bracket): medium cards that still fill the shell.
  if (columnCount <= 5) return { minWidth: 168, maxWidth: 224, gap: 22, compact: false }
  // 6+ columns (round-of-16 and deeper): compact cards so all seven columns fit the shell at ≥1280px.
  return { minWidth: 128, maxWidth: 180, gap: 16, compact: true }
}
