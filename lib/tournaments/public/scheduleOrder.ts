// Canonical, translation-independent ordering for the public "Lịch & kết quả" (schedule & results)
// tab. The DB only sorts matches by (round_number, match_number), which interleaves groups and
// interleaves the Serie A / Serie B knockout brackets — so the rendered section order was effectively
// arbitrary (Group D before Group A, Serie A quarter-finals mixed with Serie B). These pure
// comparators impose a single stable order that does NOT depend on query order, row creation time,
// UUIDs, or translated stage labels. Presentation only — nothing here mutates domain data.

import type { PublicScheduleMatch } from './types'

// Phase order across the whole schedule: group stage first, then the Serie A (championship / main)
// knockout, then the Serie B (consolation) knockout. A null bracket on a knockout match is treated as
// Serie A — that is how the query already defaults it and how the rest of the UI reads it.
export function phaseRank(m: PublicScheduleMatch): number {
  if (m.stage === 'group') return 0
  return m.bracket === 'consolation' ? 2 : 1
}

// Explicit rank for each knockout stage WITHIN one bracket. Driven by the stable domain stage keys
// emitted by `knockoutRoundLabel` / the bracket-view helper ('round_of_16' | 'quarterfinal' |
// 'semifinal' | 'third_place' | 'final'), never by the translated label the viewer sees. Third-place
// is ordered immediately before the final, matching how a tournament schedule reads.
const KNOCKOUT_STAGE_RANK: Record<string, number> = {
  round_of_16: 100,
  quarterfinal: 200,
  semifinal: 300,
  third_place: 400,
  final: 500,
}

// Rank a knockout match's stage. Earlier, larger-bracket rounds (round_of_32, round_of_64 …) surface
// as a generic `round_N` label; they sort by their bracket round number, always ahead of the named
// late stages. An unrecognised label is placed at the END of its section (never silently folded into
// a real stage) and warned about in development so a data-shape drift is caught, not hidden.
export function knockoutStageRank(roundLabel: string | null, roundNumber: number): number {
  if (roundLabel && roundLabel in KNOCKOUT_STAGE_RANK) return KNOCKOUT_STAGE_RANK[roundLabel]
  const generic = roundLabel ? /^round_(\d+)$/.exec(roundLabel) : null
  if (generic) return Number(generic[1]) // 1,2,3… — comfortably below round_of_16 (100)
  if (roundLabel === null) return roundNumber // unlabelled knockout row: fall back to its round number
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[tournament schedule] unknown knockout stage label: "${roundLabel}"`)
  }
  return Number.MAX_SAFE_INTEGER
}

// Natural, case-insensitive compare of intrinsic group names ("A" < "B" < … < "D", "Group 2" <
// "Group 10"). The group NAME is domain data, not a translated string, so alphabetical order here IS
// the canonical A→B→C→D order the spec requires. Null / missing names sort last.
function compareGroupName(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function byId(a: PublicScheduleMatch, b: PublicScheduleMatch): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// Order group-stage matches: Group A→B→C→D, then round ascending, then match number, then a stable id
// tiebreak so the order never shifts between renders.
export function compareGroupMatches(a: PublicScheduleMatch, b: PublicScheduleMatch): number {
  const g = compareGroupName(a.groupName, b.groupName)
  if (g !== 0) return g
  if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber
  if (a.matchNumber !== b.matchNumber) return a.matchNumber - b.matchNumber
  return byId(a, b)
}

// Order knockout matches: Serie A before Serie B, then stage (…→QF→SF→3rd→Final), then round number,
// then match number, then a stable id tiebreak.
export function compareKnockoutMatches(a: PublicScheduleMatch, b: PublicScheduleMatch): number {
  const pa = phaseRank(a)
  const pb = phaseRank(b)
  if (pa !== pb) return pa - pb
  const sa = knockoutStageRank(a.roundLabel, a.roundNumber)
  const sb = knockoutStageRank(b.roundLabel, b.roundNumber)
  if (sa !== sb) return sa - sb
  if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber
  if (a.matchNumber !== b.matchNumber) return a.matchNumber - b.matchNumber
  return byId(a, b)
}

// Full canonical order across the whole schedule: group stage first (A→B→C→D by round/match), then
// Serie A knockout (by stage), then Serie B knockout (by stage). Used by the render layer and tests.
export function compareScheduleMatches(a: PublicScheduleMatch, b: PublicScheduleMatch): number {
  const pa = phaseRank(a)
  const pb = phaseRank(b)
  if (pa !== pb) return pa - pb
  return a.stage === 'group' ? compareGroupMatches(a, b) : compareKnockoutMatches(a, b)
}

// Convenience: a new array in canonical order (never mutates the input).
export function orderedSchedule(schedule: readonly PublicScheduleMatch[]): PublicScheduleMatch[] {
  return [...schedule].sort(compareScheduleMatches)
}
