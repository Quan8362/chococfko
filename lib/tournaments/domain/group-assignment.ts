// Pure group-assignment validation for the group stage (round_robin & group_knockout only).
// No I/O. Two concerns, kept separate:
//   1. validateAssignmentPayload — the desired-state payload is a valid PERMUTATION of the event's
//      existing competitors across its existing groups (used before a SAVE). Every group must be
//      described exactly once; every competitor must appear exactly once (in a group OR the
//      explicit "unassigned" list); no foreign / duplicate / missing ids.
//   2. evaluateReadiness — the pre-GENERATE checks (design doc §8): nobody left unassigned, no
//      empty / single-competitor group, and for group_knockout each group holds at least the
//      qualifier capacity it must feed forward.
// Both are deterministic and never mutate their inputs.

import type { CompetitorId, GroupId } from './types.ts'

export type GroupStageFormat = 'round_robin' | 'group_knockout'

// One group's desired membership, competitor ids in display order.
export interface AssignmentGroupInput {
  readonly groupId: GroupId
  readonly competitorIds: readonly CompetitorId[]
}

// The FULL desired state of the board — every group + the competitors deliberately left unassigned.
export interface AssignmentPayload {
  readonly groups: readonly AssignmentGroupInput[]
  readonly unassignedIds: readonly CompetitorId[]
}

// Ground truth reloaded from the DB — never trusted from the client.
export interface PayloadTruth {
  readonly competitorIds: readonly CompetitorId[]
  readonly groupIds: readonly GroupId[]
}

export type PayloadError =
  | { readonly code: 'unknown_group'; readonly groupId: GroupId }
  | { readonly code: 'duplicate_group'; readonly groupId: GroupId }
  | { readonly code: 'missing_group'; readonly groupId: GroupId }
  | { readonly code: 'unknown_competitor'; readonly competitorId: CompetitorId }
  | { readonly code: 'duplicate_competitor'; readonly competitorId: CompetitorId }
  | { readonly code: 'missing_competitor'; readonly competitorId: CompetitorId }

export type PayloadValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly PayloadError[] }

/**
 * Validate that `payload` is a valid permutation of the event's competitors over its groups.
 * The payload must describe EVERY group (empty groups carry an empty array) and place EVERY
 * competitor exactly once — either inside a group or in the explicit unassigned list.
 */
export function validateAssignmentPayload(
  payload: AssignmentPayload,
  truth: PayloadTruth,
): PayloadValidation {
  const errors: PayloadError[] = []

  const truthGroups = new Set(truth.groupIds)
  const truthCompetitors = new Set(truth.competitorIds)

  // ── Groups: known, no duplicates, and all present ──────────────────────────────────────────
  const seenGroups = new Set<GroupId>()
  for (const g of payload.groups) {
    if (!truthGroups.has(g.groupId)) errors.push({ code: 'unknown_group', groupId: g.groupId })
    else if (seenGroups.has(g.groupId)) errors.push({ code: 'duplicate_group', groupId: g.groupId })
    else seenGroups.add(g.groupId)
  }
  for (const id of truth.groupIds) {
    if (!seenGroups.has(id)) errors.push({ code: 'missing_group', groupId: id })
  }

  // ── Competitors: every id (in a group OR unassigned) known, unique, and all present ─────────
  const seenCompetitors = new Set<CompetitorId>()
  const consider = (id: CompetitorId) => {
    if (!truthCompetitors.has(id)) errors.push({ code: 'unknown_competitor', competitorId: id })
    else if (seenCompetitors.has(id)) errors.push({ code: 'duplicate_competitor', competitorId: id })
    else seenCompetitors.add(id)
  }
  for (const g of payload.groups) for (const id of g.competitorIds) consider(id)
  for (const id of payload.unassignedIds) consider(id)

  for (const id of truth.competitorIds) {
    if (!seenCompetitors.has(id)) errors.push({ code: 'missing_competitor', competitorId: id })
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export interface ReadinessContext {
  readonly format: GroupStageFormat
  readonly winnerQualifiersPerGroup: number
  readonly consolationQualifiersPerGroup: number
}

export type ReadinessIssue =
  | { readonly code: 'no_groups' }
  | { readonly code: 'unassigned_remaining'; readonly competitorIds: readonly CompetitorId[] }
  | { readonly code: 'empty_group'; readonly groupId: GroupId }
  | { readonly code: 'group_too_small'; readonly groupId: GroupId; readonly size: number; readonly required: number }
  | {
      readonly code: 'insufficient_qualifier_capacity'
      readonly groupId: GroupId
      readonly size: number
      readonly required: number
    }

export interface Readiness {
  readonly ok: boolean
  readonly issues: readonly ReadinessIssue[]
  // Minimum competitors every group must hold: 2 for round_robin; max(2, winner+consolation) for GK.
  readonly requiredPerGroup: number
}

/** The minimum competitors a group must contain for the given format/qualifier settings. */
export function requiredGroupSize(ctx: ReadinessContext): number {
  if (ctx.format === 'group_knockout') {
    return Math.max(2, ctx.winnerQualifiersPerGroup + ctx.consolationQualifiersPerGroup)
  }
  return 2
}

/**
 * Evaluate whether an assignment is ready to generate group matches. Blocks on: no groups at all,
 * anyone still unassigned, an empty group, a single-competitor group, or (group_knockout) a group
 * that cannot supply its winner+consolation qualifier capacity. Never mutates its input.
 */
export function evaluateReadiness(payload: AssignmentPayload, ctx: ReadinessContext): Readiness {
  const required = requiredGroupSize(ctx)
  const issues: ReadinessIssue[] = []

  if (payload.groups.length === 0) issues.push({ code: 'no_groups' })

  if (payload.unassignedIds.length > 0) {
    issues.push({ code: 'unassigned_remaining', competitorIds: [...payload.unassignedIds] })
  }

  for (const g of payload.groups) {
    const size = g.competitorIds.length
    if (size === 0) {
      issues.push({ code: 'empty_group', groupId: g.groupId })
    } else if (size < 2) {
      issues.push({ code: 'group_too_small', groupId: g.groupId, size, required })
    } else if (size < required) {
      // size ≥ 2 but below the qualifier capacity → only reachable for group_knockout.
      issues.push({ code: 'insufficient_qualifier_capacity', groupId: g.groupId, size, required })
    }
  }

  return { ok: issues.length === 0, issues, requiredPerGroup: required }
}

/**
 * Stable group names for `count` groups: A, B, …, Z, AA, AB, … (bijective base-26). Computed in
 * JS so the same deterministic naming is testable and shared between preview and the init RPC.
 */
export function groupLetters(count: number): string[] {
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    let n = i
    let s = ''
    do {
      s = String.fromCharCode(65 + (n % 26)) + s
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    names.push(s)
  }
  return names
}
