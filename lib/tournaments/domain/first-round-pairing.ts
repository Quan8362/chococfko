// Direct first-round pairing model (the "edit the pairings, not the seed order" workflow). An
// organiser arranges tokens straight into first-round match slots; an EMPTY slot is a BYE, wherever
// the organiser leaves it. This module is the single, pure bridge between that visual arrangement and
// the canonical seed-position representation the persistence layer + bracket engine already speak:
//
//   arrangement (matches × {a,b})  ⇄  seats[] (indexed by SEED POSITION = seed number − 1)
//
// The bracket seedOrder decides which two SEATS meet in the first round, so seat ⇄ (match, side) is a
// fixed, invertible mapping for a given bracket size. Nothing here resolves a competitor or writes a
// bracket — it only rearranges token ids. Deterministic; never mutates its inputs.

import { seedOrder } from './knockout.ts'
import { requiredBracketSize } from './knockout-seed.ts'

// One first-round match as edited: each side holds a token id or null (an empty slot = a BYE).
export interface PairingMatch {
  readonly a: string | null
  readonly b: string | null
}

// The editor's canonical arrangement: a fixed-size seat array (index = seed position) PLUS the pool of
// tokens not yet placed. seats.length is the bracket size (power of two); pool holds the remainder.
export interface PairingArrangement {
  readonly size: number
  readonly seats: readonly (string | null)[]
  readonly pool: readonly string[]
}

// A first-round slot address (which match card, which side).
export interface SlotAddress {
  readonly matchIndex: number // 0-based
  readonly side: 'a' | 'b'
}

/**
 * The bracket size the editor lays out for a branch: requiredBracketSize applied to the FULL token
 * pool (not just the currently-placed tokens), so the number of match cards is stable while an
 * organiser drags tokens around. At APPLY time every token is placed, so this equals the size the
 * engine's unchanged formula produces for the real competitor count.
 */
export function pairingBracketSize(totalTokenCount: number): number {
  return requiredBracketSize(totalTokenCount)
}

/** Seed NUMBER (1-based) occupying a given first-round slot, per the standard seedOrder. */
export function seedNumberForSlot(size: number, addr: SlotAddress): number {
  const ord = seedOrder(size)
  return ord[addr.matchIndex * 2 + (addr.side === 'a' ? 0 : 1)]
}

/** The (match, side) address of a given seed POSITION (0-based) in the first round. */
export function slotForSeedPosition(size: number, seatIndex: number): SlotAddress {
  const ord = seedOrder(size)
  const j = ord.indexOf(seatIndex + 1) // seat index = seed number − 1
  return { matchIndex: Math.floor(j / 2), side: j % 2 === 0 ? 'a' : 'b' }
}

/**
 * Build the initial arrangement for a branch from persisted seat placements. `seatByPosition` maps a
 * SEED POSITION (0-based) → token id; unmapped positions are empty (BYE-or-unfilled). `allTokenIds` is
 * the full valid token pool; any token not placed in a seat goes to the pool. Placements at positions
 * ≥ size (a shrunken pool) are dropped back into the pool rather than lost.
 */
export function buildArrangement(
  allTokenIds: readonly string[],
  seatByPosition: ReadonlyMap<number, string>,
): PairingArrangement {
  const size = pairingBracketSize(allTokenIds.length)
  const valid = new Set(allTokenIds)
  const seats: (string | null)[] = new Array(size).fill(null)
  const placed = new Set<string>()
  for (const [pos, tokenId] of Array.from(seatByPosition.entries())) {
    if (pos < 0 || pos >= size) continue
    if (!valid.has(tokenId) || placed.has(tokenId)) continue
    if (seats[pos] !== null) continue
    seats[pos] = tokenId
    placed.add(tokenId)
  }
  const pool = allTokenIds.filter((id) => !placed.has(id))
  return { size, seats, pool }
}

/** The seated token ids in seed-position order (nulls dropped) — the "seed order" for compatibility. */
export function seatedTokenOrder(arr: PairingArrangement): string[] {
  return arr.seats.filter((s): s is string => s !== null)
}

/**
 * Persist mapping: token id → SEED POSITION for every placed token. This is the value written to
 * tournament_knockout_seed_slots.slot_index; empty seats (BYEs) simply get no row. Losslessly
 * round-trips with buildArrangement.
 */
export function arrangementToSlotIndexByToken(arr: PairingArrangement): Map<string, number> {
  const out = new Map<string, number>()
  arr.seats.forEach((tokenId, pos) => {
    if (tokenId !== null) out.set(tokenId, pos)
  })
  return out
}

/** The first-round match cards derived from the seat array (size/2 matches, in match order). */
export function arrangementMatches(arr: PairingArrangement): PairingMatch[] {
  const ord = seedOrder(arr.size)
  const matches: PairingMatch[] = []
  for (let m = 0; m < arr.size / 2; m++) {
    matches.push({
      a: arr.seats[ord[2 * m] - 1] ?? null,
      b: arr.seats[ord[2 * m + 1] - 1] ?? null,
    })
  }
  return matches
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────────

export type PairingIssue =
  | { readonly code: 'unassigned_remaining'; readonly tokenIds: readonly string[] }
  | { readonly code: 'both_slots_empty'; readonly matchNumbers: readonly number[] }
  | { readonly code: 'not_enough_competitors'; readonly count: number }

export interface PairingValidation {
  readonly seatedCount: number
  readonly bracketSize: number
  readonly byes: number
  readonly issues: readonly PairingIssue[]
  // Structurally valid enough to persist a DRAFT (partial placements allowed).
  readonly canSave: boolean
  // Every token placed, ≥2 seated, no match with both slots empty → APPLY-eligible layout.
  readonly canApply: boolean
}

/**
 * Validate a live arrangement.
 *   • unassigned_remaining — tokens still in the pool: blocks APPLY only (a partial draft may be saved).
 *   • both_slots_empty — a first-round match with NO token: two BYEs would meet, which the seeding never
 *     produces. Only reported once the pool is drained (before that an empty match is just unfilled). It
 *     blocks both save and apply — a COMPLETE layout must give every match at least one team.
 *   • not_enough_competitors — fewer than two seated tokens: blocks APPLY.
 */
export function validatePairingArrangement(arr: PairingArrangement): PairingValidation {
  const issues: PairingIssue[] = []
  const seated = seatedTokenOrder(arr)
  const seatedCount = seated.length
  const poolEmpty = arr.pool.length === 0

  const emptyMatches: number[] = []
  arrangementMatches(arr).forEach((m, i) => {
    if (m.a === null && m.b === null) emptyMatches.push(i + 1)
  })
  // A both-empty match only matters for a COMPLETE arrangement — while tokens remain in the pool the
  // slot is simply not filled yet, not a doomed two-BYE pairing.
  const brokenComplete = poolEmpty && emptyMatches.length > 0
  if (brokenComplete) issues.push({ code: 'both_slots_empty', matchNumbers: emptyMatches })
  if (!poolEmpty) issues.push({ code: 'unassigned_remaining', tokenIds: [...arr.pool] })
  if (seatedCount < 2) issues.push({ code: 'not_enough_competitors', count: seatedCount })

  return {
    seatedCount,
    bracketSize: arr.size,
    // Empty seats are BYEs. With the pool drained this equals the unchanged knockoutByeCount formula.
    byes: arr.size - seatedCount,
    issues,
    canSave: !brokenComplete,
    canApply: poolEmpty && emptyMatches.length === 0 && seatedCount >= 2,
  }
}
