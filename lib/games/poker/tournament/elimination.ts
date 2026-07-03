// ── Poker TOURNAMENT — elimination ordering (TNMT-ELIM) ─────────────────────────────────
//
// PURE. Turns a sequence of "players busted in hand H" events into finishing places, applying the
// frozen simultaneous-elimination rule: same-hand knockouts are ranked by chips at the START of
// the busting hand (more chips → higher place); equal starting chips → a TRUE TIE sharing a
// contiguous block of places (TNMT-ELIM-003 / TNMT-PAY-026). Elimination happens only from a
// FULLY-SETTLED hand (TNMT-ELIM-010) — the caller guarantees that; this module just orders.

import type { EliminationRecord } from './types.ts'

// A single busted player as reported by the settled hand.
export interface BustedPlayer {
  readonly entryId: string
  readonly userId: string
  readonly chipsAtHandStart: number   // tie-break key
}

// Assign finishing places to the players busted in ONE hand, given how many players remained
// BEFORE the hand resolved (TNMT-ELIM-011). The busted group occupies the WORST places among the
// field: [remainingBefore - K + 1 .. remainingBefore], K = busted.length. Within the group, more
// chips-at-hand-start → better (lower-numbered) place; equal chips tie on a shared place.
export function assignPlacesForHand(remainingBefore: number, busted: readonly BustedPlayer[]): EliminationRecord[] {
  const K = busted.length
  if (K === 0) return []
  if (!Number.isInteger(remainingBefore) || remainingBefore < 1) throw new Error('elimination: bad remainingBefore')
  if (K >= remainingBefore) {
    // At least one player must survive a hand (the pot has a winner), so a bust can never take the
    // whole remaining field. This guards against a caller mis-reporting a double-count.
    throw new Error(`elimination: ${K} busts with only ${remainingBefore} remaining (no survivor)`)
  }

  // Sort by chips descending (more chips finish better). Stable tie-break by entryId keeps output
  // deterministic within a true tie.
  const sorted = [...busted].sort((a, b) => (b.chipsAtHandStart - a.chipsAtHandStart) || (a.entryId < b.entryId ? -1 : 1))

  const records: EliminationRecord[] = []
  let place = remainingBefore - K + 1 // best place available to the busted group
  let i = 0
  while (i < sorted.length) {
    // Gather a tie-group of equal chipsAtHandStart.
    let j = i + 1
    while (j < sorted.length && sorted[j].chipsAtHandStart === sorted[i].chipsAtHandStart) j++
    const groupSize = j - i
    const tied = groupSize > 1
    for (let k = i; k < j; k++) {
      records.push({
        entryId: sorted[k].entryId,
        userId: sorted[k].userId,
        finishingPlace: place, // whole tie-group shares the top place of its sub-block
        handNo: 0,             // stamped by the caller/DB; 0 = unset here
        chipsAtHandStart: sorted[k].chipsAtHandStart,
        tied,
      })
    }
    place += groupSize
    i = j
  }
  return records
}

// Build the FULL finishing order for a completed tournament from the sequence of per-hand bust
// events (in the order hands resolved) plus the eventual single winner. Places: winner = 1, then
// runners-up by reverse bust order. Returns records sorted by finishingPlace ascending.
export interface HandBustEvent {
  readonly handNo: number
  readonly remainingBefore: number
  readonly busted: readonly BustedPlayer[]
}

export function assignFinishingOrder(
  events: readonly HandBustEvent[],
  winner: { readonly entryId: string; readonly userId: string },
): EliminationRecord[] {
  const all: EliminationRecord[] = [
    { entryId: winner.entryId, userId: winner.userId, finishingPlace: 1, handNo: 0, chipsAtHandStart: 0, tied: false },
  ]
  for (const ev of events) {
    for (const r of assignPlacesForHand(ev.remainingBefore, ev.busted)) {
      all.push({ ...r, handNo: ev.handNo })
    }
  }
  return all.sort((a, b) => a.finishingPlace - b.finishingPlace)
}

// The distinct places that are TIED and how many entries share each — the input payout.ts needs to
// combine tied prize blocks. Returns a map place → count (count 1 = not shared).
export function placeMultiplicity(records: readonly EliminationRecord[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const r of records) m.set(r.finishingPlace, (m.get(r.finishingPlace) ?? 0) + 1)
  return m
}
