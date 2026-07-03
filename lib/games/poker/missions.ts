// ── Poker MISSIONS — a safe, one-time "getting started" checklist (pure) ───────────────────
//
// PURE module — no React, no Supabase, no clock, no process.env. Tested by missions.test.ts.
//
// DESIGN INTENT (responsible-engagement). These are BEGINNER ONBOARDING goals, not daily quests.
// Every mission is period 'once' — it is completed permanently and never resets. There is NO
// daily streak, NO "come back tomorrow" hook, NO time-played target, and NO coin reward (a
// completed mission is a cosmetic tick + optional badge only). This deliberately avoids the
// engagement-maximising patterns the brief forbids: chasing losses, all-ins, winning a specific
// large amount, long uninterrupted sessions, or any coordinated behaviour.
//
// Each mission is earnable by ONE honest hand (or by reading the rules / trying the trainer). If
// you add one, keep it teach-the-game shaped and free of any incentive to gamble recklessly.

export type MissionKey =
  | 'complete_3_hands'
  | 'use_check'
  | 'reach_showdown'
  | 'review_rules'
  | 'complete_training'
  | 'play_beginner_blind'

// How a mission's progress is fed:
//   • 'hand'    — advanced by the authoritative settlement recorder (server-derived facts).
//   • 'action'  — advanced by an explicit, idempotent player action (opened the rules, finished a
//                 trainer scenario). The eligibility is still server-recorded and capped at the
//                 target, so replaying the action farms nothing.
export type MissionSource = 'hand' | 'action'

export interface MissionDef {
  readonly key: MissionKey
  readonly source: MissionSource
  readonly target: number  // progress needed to complete (>= 1)
  // i18n leaf under games.poker.missions.item.<key> → { name, desc }.
  readonly i18n: string
  readonly icon: string
}

export const POKER_MISSIONS: readonly MissionDef[] = [
  { key: 'complete_3_hands',    source: 'hand',   target: 3, i18n: 'complete_3_hands',    icon: 'hands' },
  { key: 'use_check',           source: 'hand',   target: 1, i18n: 'use_check',           icon: 'check' },
  { key: 'reach_showdown',      source: 'hand',   target: 1, i18n: 'reach_showdown',      icon: 'reveal' },
  { key: 'play_beginner_blind', source: 'hand',   target: 1, i18n: 'play_beginner_blind', icon: 'blind' },
  { key: 'review_rules',        source: 'action', target: 1, i18n: 'review_rules',        icon: 'book' },
  { key: 'complete_training',   source: 'action', target: 1, i18n: 'complete_training',   icon: 'trainer' },
]

export const MISSION_KEYS: readonly MissionKey[] = POKER_MISSIONS.map((m) => m.key)
const KEY_SET: ReadonlySet<string> = new Set(MISSION_KEYS)

export function isMissionKey(k: string): k is MissionKey {
  return KEY_SET.has(k)
}

export function missionDef(key: MissionKey): MissionDef {
  const d = POKER_MISSIONS.find((m) => m.key === key)
  if (!d) throw new Error(`poker missions: unknown key "${key}"`)
  return d
}

// The 'once' period key persisted with every mission row. A single constant (not a date) because
// these missions never reset — kept as a column so the schema can grow rotating missions later
// WITHOUT a migration to the existing rows.
export const MISSION_PERIOD_ONCE = 'once'

// ── Progress model ───────────────────────────────────────────────────────────────────────────
export interface MissionProgress {
  readonly key: MissionKey
  readonly progress: number   // clamped to [0, target]
  readonly target: number
  readonly completed: boolean
}

export function emptyProgress(key: MissionKey): MissionProgress {
  const def = missionDef(key)
  return { key, progress: 0, target: def.target, completed: false }
}

// Apply an increment to a mission's progress. Pure + idempotent-friendly: progress is clamped to
// the target so no amount of extra increments can overshoot, and `completed` latches true. The DB
// recorder mirrors exactly this clamp (LEAST(target, progress+inc)) so client and server agree.
export function applyMissionProgress(prev: MissionProgress, inc: number): MissionProgress {
  if (inc <= 0) return prev
  const progress = Math.min(prev.target, prev.progress + inc)
  return { ...prev, progress, completed: progress >= prev.target }
}

// ── Per-hand mission increments (server-derived) ───────────────────────────────────────────
// The AUTHORITATIVE per-seat facts a completed hand yields for the 'hand'-sourced missions. Every
// field is computed server-side from the settlement/engine state; none is client-supplied.
export interface HandMissionFact {
  readonly playedHand: boolean       // dealt into a completed hand
  readonly usedCheckLegally: boolean // performed at least one legal 'check' this hand
  readonly reachedShowdown: boolean  // was a non-folded contender at a real showdown
  readonly atBeginnerBlind: boolean  // the table's big blind is within the beginner tier(s)
}

// Map the hand facts → the mission increments to record for this user this hand. Returns entries
// only for missions that advanced (inc > 0), so the recorder writes nothing for a no-op.
export interface MissionIncrement {
  readonly key: MissionKey
  readonly inc: number
}

export function handMissionIncrements(fact: HandMissionFact): MissionIncrement[] {
  const out: MissionIncrement[] = []
  if (fact.playedHand) out.push({ key: 'complete_3_hands', inc: 1 })
  if (fact.usedCheckLegally) out.push({ key: 'use_check', inc: 1 })
  if (fact.reachedShowdown) out.push({ key: 'reach_showdown', inc: 1 })
  if (fact.atBeginnerBlind) out.push({ key: 'play_beginner_blind', inc: 1 })
  return out
}

// The beginner blind ceiling: a table qualifies for `play_beginner_blind` when its big blind is at
// or below the largest big blind among the two lowest configured tiers. Passed the config's tier
// big blinds so the pure module needs no economy-config import (avoids a server/pure cycle).
export const BEGINNER_TIER_COUNT = 2

export function beginnerBigBlindCeiling(tierBigBlinds: readonly number[]): number {
  if (tierBigBlinds.length === 0) return 0
  const sorted = [...tierBigBlinds].sort((a, b) => a - b)
  const idx = Math.min(BEGINNER_TIER_COUNT, sorted.length) - 1
  return sorted[idx]
}

export function isBeginnerBigBlind(bigBlind: number, tierBigBlinds: readonly number[]): boolean {
  return bigBlind > 0 && bigBlind <= beginnerBigBlindCeiling(tierBigBlinds)
}
