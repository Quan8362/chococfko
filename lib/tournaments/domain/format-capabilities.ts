// Single source of truth for "what does this event format support?". Pure & deterministic.
//
// Before this helper existed, the same questions ("does round_robin have a bracket?", "does knockout
// have standings?") were answered ad-hoc with `format === 'knockout'` / `format !== 'round_robin'`
// string comparisons scattered across the admin page, the public detail tabs, the queries and the
// components. Every new decision site risked disagreeing with the others — the exact way a format
// ends up showing the wrong tab (a pure round-robin surfacing an empty "Nhánh đấu"). Route ALL such
// decisions through `formatCapabilities` so admin, public, generators and resolvers agree by design.
//
// Consolation is the one capability that also depends on configuration (a group+knockout event with
// zero consolation qualifiers has no consolation branch), so it lives in a separate config-aware
// helper — the format only says whether a consolation branch is POSSIBLE.

import type { EventFormat } from './types.ts'

export interface FormatCapabilities {
  // A round-robin group phase exists (competitors are divided into groups that each play a full
  // round-robin). True for round_robin and for the group stage of group_knockout.
  readonly hasGroupStage: boolean
  // A single-elimination knockout phase exists.
  readonly hasKnockout: boolean
  // The admin must divide competitors into groups (the "Chia bảng" tab is meaningful).
  readonly needsGroupAssignment: boolean
  // A standings table is a meaningful result surface (the "Bảng xếp hạng" tab is shown).
  readonly needsStandings: boolean
  // A knockout bracket is a meaningful surface (the "Xếp nhánh" / "Nhánh đấu" tabs are shown).
  readonly needsBracket: boolean
  // The winners' (championship) bracket exists whenever there is any knockout.
  readonly hasChampionshipBracket: boolean
  // The format CAN carry a consolation (losers') branch. Actual presence also needs qualifiers > 0 —
  // use `hasConsolationBracket(format, consolationQualifiersPerGroup)`.
  readonly canHaveConsolationBracket: boolean
  // A third-place playoff is an available option (only where a knockout produces two semifinal losers).
  readonly hasThirdPlaceOption: boolean
  // A podium ("Thành tích") is derived from a knockout final rather than from standings.
  readonly hasPodium: boolean
}

const CAPABILITIES: Record<EventFormat, FormatCapabilities> = {
  round_robin: {
    hasGroupStage: true,
    hasKnockout: false,
    needsGroupAssignment: true,
    needsStandings: true,
    needsBracket: false,
    hasChampionshipBracket: false,
    canHaveConsolationBracket: false,
    hasThirdPlaceOption: false,
    hasPodium: false,
  },
  knockout: {
    hasGroupStage: false,
    hasKnockout: true,
    needsGroupAssignment: false,
    needsStandings: false,
    needsBracket: true,
    hasChampionshipBracket: true,
    canHaveConsolationBracket: false,
    hasThirdPlaceOption: true,
    hasPodium: true,
  },
  group_knockout: {
    hasGroupStage: true,
    hasKnockout: true,
    needsGroupAssignment: true,
    needsStandings: true,
    needsBracket: true,
    hasChampionshipBracket: true,
    canHaveConsolationBracket: true,
    hasThirdPlaceOption: true,
    hasPodium: true,
  },
}

/** The capabilities of a given event format. Deterministic; the returned object is frozen. */
export function formatCapabilities(format: EventFormat): FormatCapabilities {
  return CAPABILITIES[format]
}

/**
 * Whether a specific event actually carries a consolation bracket: only group+knockout, and only when
 * at least one consolation qualifier per group is configured. A group+knockout event with zero
 * consolation qualifiers must NOT show a consolation branch or generate an empty one (design §6).
 */
export function hasConsolationBracket(format: EventFormat, consolationQualifiersPerGroup: number): boolean {
  return formatCapabilities(format).canHaveConsolationBracket && consolationQualifiersPerGroup > 0
}

// Freeze so no consumer can accidentally mutate a shared capability record.
for (const c of Object.values(CAPABILITIES)) Object.freeze(c)
Object.freeze(CAPABILITIES)
