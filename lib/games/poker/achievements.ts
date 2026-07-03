// ── Poker ACHIEVEMENTS — cosmetic, server-authoritative catalog + pure award logic ─────────
//
// PURE module — no React, no Supabase, no clock, no process.env. Tested by achievements.test.ts.
//
// COSMETIC-ONLY LAW: an achievement unlock is a BADGE. It moves ZERO coins, grants no stack, no
// buy-in, no faucet — there is nothing here to farm, duplicate, or dump. Poker settlement stays
// exactly zero-sum (economy-design). This keeps "reward safety" trivial: the only thing that can
// go wrong is unlocking a badge twice, which the DB layer makes impossible (unique unlock row,
// ON CONFLICT DO NOTHING) and which this pure layer never depends on.
//
// SERVER-AUTHORITATIVE: every award is derived HERE from the AUTHORITATIVE settlement facts the
// server computes (winnersByPot, pots, revealed showdown, the winner's evaluated hand). The
// browser never asserts "I earned X" — it only ever displays what the server unlocked.
//
// 🔴 RESPONSIBLE-ENGAGEMENT GUARDRAIL (social-game-design). This catalog intentionally rewards
// SKILL, MILESTONES and MOMENTS-OF-PLAY. It deliberately does NOT reward, and must never reward:
//   • losing coins on purpose / chip-dumping           • repeated all-ins or reckless shoves
//   • folding to a specific player (collusion signal)  • transferring value to a friend
//   • long uninterrupted sessions / "time played"      • winning a specific large amount
// If you add an achievement, it must be earnable by ONE honest hand of normal play and must not
// create an incentive for any behaviour on that list. See docs/poker/economy-design.md.

import { HAND_CATEGORY_LABEL, HandCategory, evaluateHand } from './evaluator.ts'
import type { Card } from './types.ts'

// The stable machine keys. Never rename one after it ships — a rename orphans every unlock row.
export type AchievementKey =
  | 'first_hand'
  | 'first_pot'
  | 'first_showdown_win'
  | 'win_straight'
  | 'win_flush'
  | 'win_full_house'
  | 'win_four_of_a_kind'
  | 'win_straight_flush'
  | 'win_split_pot'
  | 'win_side_pot'
  | 'reconnect_finish'
  | 'full_table'
  | 'hands_10'
  | 'hands_100'
  | 'hands_1000'

export type AchievementGroup = 'milestone' | 'showdown' | 'handmade' | 'resilience'

export interface AchievementDef {
  readonly key: AchievementKey
  readonly group: AchievementGroup
  // i18n leaf under games.poker.achievements.item.<key> → { name, desc }. NO baked UI strings.
  readonly i18n: string
  // A stable icon token the UI maps to an inline SVG/emblem (never an OS emoji — CLAUDE.md §11).
  readonly icon: string
  // Hidden achievements are not listed until unlocked (avoids a checklist that nudges grind).
  readonly hidden?: boolean
}

// The catalog. Order here is the display order.
export const POKER_ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: 'first_hand',         group: 'milestone',  i18n: 'first_hand',         icon: 'card' },
  { key: 'first_pot',          group: 'milestone',  i18n: 'first_pot',          icon: 'chip' },
  { key: 'first_showdown_win', group: 'showdown',   i18n: 'first_showdown_win', icon: 'reveal' },
  { key: 'win_straight',       group: 'handmade',   i18n: 'win_straight',       icon: 'straight' },
  { key: 'win_flush',          group: 'handmade',   i18n: 'win_flush',          icon: 'flush' },
  { key: 'win_full_house',     group: 'handmade',   i18n: 'win_full_house',     icon: 'fullhouse' },
  { key: 'win_four_of_a_kind', group: 'handmade',   i18n: 'win_four_of_a_kind', icon: 'quads' },
  { key: 'win_straight_flush', group: 'handmade',   i18n: 'win_straight_flush', icon: 'straightflush' },
  { key: 'win_split_pot',      group: 'showdown',   i18n: 'win_split_pot',      icon: 'split' },
  { key: 'win_side_pot',       group: 'showdown',   i18n: 'win_side_pot',       icon: 'side' },
  { key: 'reconnect_finish',   group: 'resilience', i18n: 'reconnect_finish',   icon: 'reconnect' },
  { key: 'full_table',         group: 'milestone',  i18n: 'full_table',         icon: 'table' },
  { key: 'hands_10',           group: 'milestone',  i18n: 'hands_10',           icon: 'ten' },
  { key: 'hands_100',          group: 'milestone',  i18n: 'hands_100',          icon: 'hundred' },
  { key: 'hands_1000',         group: 'milestone',  i18n: 'hands_1000',         icon: 'thousand' },
]

export const ACHIEVEMENT_KEYS: readonly AchievementKey[] = POKER_ACHIEVEMENTS.map((a) => a.key)
const KEY_SET: ReadonlySet<string> = new Set(ACHIEVEMENT_KEYS)

export function isAchievementKey(k: string): k is AchievementKey {
  return KEY_SET.has(k)
}

export function achievementDef(key: AchievementKey): AchievementDef {
  const d = POKER_ACHIEVEMENTS.find((a) => a.key === key)
  if (!d) throw new Error(`poker achievements: unknown key "${key}"`)
  return d
}

// Cumulative "hands played" milestones. Thresholds live HERE (single source of truth); the DB
// recorder receives this list and unlocks a milestone the moment the authoritative counter
// crosses `at`. Sorted ascending; each is idempotent (unique unlock row).
export interface HandsMilestone {
  readonly key: Extract<AchievementKey, 'hands_10' | 'hands_100' | 'hands_1000'>
  readonly at: number
}
export const HANDS_MILESTONES: readonly HandsMilestone[] = [
  { key: 'hands_10', at: 10 },
  { key: 'hands_100', at: 100 },
  { key: 'hands_1000', at: 1000 },
]

// The maximum number of seats a "full table" achievement requires. Mirrors the economy config's
// tableLimits.maxSeats (six-max). Kept as a constant so the pure module needs no config import.
export const FULL_TABLE_SEATS = 6

// ── Per-seat settlement fact ────────────────────────────────────────────────────────────────
// The AUTHORITATIVE, already-computed outcome for one seat in one completed hand. Every field is
// derivable server-side from the showdown result + engine contributions; NONE is client-supplied.
export interface SeatHandFact {
  readonly userId: string
  readonly seatIndex: number
  readonly folded: boolean
  readonly payout: number            // total coins won this hand (>= 0, integer)
  readonly wonAtShowdown: boolean     // won a pot AND the hand was contested to showdown
  readonly wonSplitPot: boolean       // shared a single pot with >= 1 other winner
  readonly wonSidePot: boolean        // won a side pot (pot index >= 1 with a positive amount)
  readonly winningCategoryLabel: string | null // HAND_CATEGORY_LABEL of the seat's winning hand, or null
  readonly reconnectedDuringHand: boolean       // a server-recorded reconnect happened this hand
}

// The instantaneous (non-cumulative) achievements a single seat earns from ONE hand. Cumulative
// milestones (first_hand / hands_N) are handled separately by the recorder because they need the
// running counter — see HANDS_MILESTONES / awardsForHand below.
export function instantSeatAchievements(fact: SeatHandFact): AchievementKey[] {
  const out: AchievementKey[] = []
  const wonPot = fact.payout > 0

  if (wonPot) out.push('first_pot')
  if (fact.wonAtShowdown) out.push('first_showdown_win')
  if (fact.wonSplitPot) out.push('win_split_pot')
  if (fact.wonSidePot) out.push('win_side_pot')

  // Made-hand badges require a WON pot AND a showdown reveal so the hand was actually made and
  // seen — "win with a flush" that nobody contested is not awarded (avoids rewarding a fold-out).
  if (wonPot && fact.wonAtShowdown && fact.winningCategoryLabel) {
    const madeHand = CATEGORY_ACHIEVEMENT[fact.winningCategoryLabel]
    if (madeHand) out.push(madeHand)
  }

  if (fact.reconnectedDuringHand && !fact.folded) out.push('reconnect_finish')

  return out
}

// Map an evaluator category label → its achievement (only categories that get a badge).
const CATEGORY_ACHIEVEMENT: Readonly<Record<string, AchievementKey | undefined>> = {
  [HAND_CATEGORY_LABEL[HandCategory.Straight]]: 'win_straight',
  [HAND_CATEGORY_LABEL[HandCategory.Flush]]: 'win_flush',
  [HAND_CATEGORY_LABEL[HandCategory.FullHouse]]: 'win_full_house',
  [HAND_CATEGORY_LABEL[HandCategory.FourOfAKind]]: 'win_four_of_a_kind',
  [HAND_CATEGORY_LABEL[HandCategory.StraightFlush]]: 'win_straight_flush',
}

// Evaluate the category LABEL of a seat's best hand at showdown, or null when the board is too
// short to form a five-card hand (e.g. an all-in resolved before the flop). Pure wrapper over the
// evaluator so the recorder never re-implements hand reading.
export function winningCategoryLabel(
  hole: readonly [Card, Card] | undefined,
  board: readonly Card[],
): string | null {
  if (!hole) return null
  if (hole.length + board.length < 5) return null
  return HAND_CATEGORY_LABEL[evaluateHand(hole, board).category]
}

// ── Whole-hand award assembly (per seat) ─────────────────────────────────────────────────────
// Given the hand facts, produce — for each seat — the unconditional unlocks, whether the seat's
// running "hands played" counter should increment (any dealt-in participant), and the milestone
// thresholds to hand to the DB. `full_table` is a table-level award applied to every participant
// when exactly FULL_TABLE_SEATS were dealt in.
export interface SeatAwards {
  readonly userId: string
  readonly achievements: AchievementKey[]   // unconditional unlocks (idempotent at DB layer)
  readonly countsHand: boolean              // increment the hands-played counter for this user
  readonly milestones: readonly HandsMilestone[] // unlock these once the counter reaches `.at`
}

export interface HandAwardInput {
  readonly seatCount: number                 // players DEALT INTO this hand
  readonly seats: readonly SeatHandFact[]
}

export function awardsForHand(input: HandAwardInput): SeatAwards[] {
  const fullTable = input.seatCount >= FULL_TABLE_SEATS
  return input.seats.map((fact) => {
    const achievements = new Set<AchievementKey>(['first_hand', ...instantSeatAchievements(fact)])
    if (fullTable) achievements.add('full_table')
    return {
      userId: fact.userId,
      achievements: Array.from(achievements),
      countsHand: true,
      milestones: HANDS_MILESTONES,
    }
  })
}
