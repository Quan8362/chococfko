// Pure, dependency-free validation for tournament EVENTS (nội dung thi đấu). Shared by the admin
// event form (client) and the server actions (server). No I/O, no request-scoped server imports,
// no path-aliased imports → safe to import from Client Components AND runnable under `node --test`.
//
// Mirrors the DB CHECK constraints in supabase/migration_tournament_core.sql for
// tournament_events so client + server + database agree:
//   • name not empty
//   • format ∈ (round_robin | knockout | group_knockout)
//   • group_count / winner_qualifiers / consolation_qualifiers >= 0
//   • group_knockout ⇒ winner_qualifiers >= 1 AND group_count >= 1
//   • round_robin   ⇒ group_count >= 1
//
// It ALSO applies the format-conditional normalization from the design doc §5:
//   round_robin    → qualification counts reset to 0, third-place off, group_count kept (>=1)
//   knockout       → group_count neutralized to 1, qualification counts reset to 0, third-place kept
//   group_knockout → group_count >=1, winner >=1, consolation >=0, third-place kept
// so a field hidden for the chosen format can never leak a stale value into the DB.

// Kept local (not imported from lib/tournaments/domain) so this module stays free of any
// `.ts`-suffixed engine imports the Next bundler would reject. Same union as the schema + domain.
export type EventFormat = 'round_robin' | 'knockout' | 'group_knockout'

export const EVENT_FORMATS: readonly EventFormat[] = [
  'round_robin',
  'knockout',
  'group_knockout',
] as const

export function isEventFormat(v: string | null | undefined): v is EventFormat {
  return !!v && (EVENT_FORMATS as readonly string[]).includes(v)
}

export const EVENT_NAME_MAX = 200
// Sanity caps (not DB-enforced beyond >=0) so a typo can't request 10^6 groups / qualifiers.
export const EVENT_GROUP_COUNT_MAX = 64
export const EVENT_QUALIFIERS_MAX = 32

// Stable machine codes → the UI localizes each; never surface raw strings.
export type EventFieldErrorCode =
  | 'name_required'
  | 'name_too_long'
  | 'format_invalid'
  | 'group_count_invalid'
  | 'winner_qualifiers_invalid'
  | 'consolation_qualifiers_invalid'

export type EventFieldKey =
  | 'name'
  | 'format'
  | 'groupCount'
  | 'winnerQualifiersPerGroup'
  | 'consolationQualifiersPerGroup'

export type EventFieldErrors = Partial<Record<EventFieldKey, EventFieldErrorCode>>

// Raw form values (strings as they arrive from inputs / the client payload).
export interface EventFormValues {
  name: string
  format: string
  groupCount: string
  winnerQualifiersPerGroup: string
  consolationQualifiersPerGroup: string
  thirdPlaceEnabled: boolean
}

// Cleaned values ready to write to the DB (already format-normalized).
export interface NormalizedEventInput {
  name: string
  format: EventFormat
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
}

// Parse a non-negative integer from a form string. Returns null on anything that is not a clean
// whole number ≥ 0 (empty, decimals, letters, negatives) so callers can flag it.
function parseCount(raw: string): number | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/**
 * Validate + normalize an event form payload. Returns either the cleaned value ready for the DB,
 * or a map of field → error code. Applies the format-conditional rules so hidden fields are reset
 * rather than trusted. The event STATUS is never part of this payload — the server always writes
 * 'setup' on create and never accepts a client-chosen status.
 */
export function validateEventInput(
  values: EventFormValues,
): { ok: true; value: NormalizedEventInput } | { ok: false; errors: EventFieldErrors } {
  const errors: EventFieldErrors = {}

  const name = (values.name ?? '').trim()
  if (!name) errors.name = 'name_required'
  else if (name.length > EVENT_NAME_MAX) errors.name = 'name_too_long'

  const format = values.format
  if (!isEventFormat(format)) {
    // Without a valid format we cannot apply conditional rules → bail early.
    errors.format = 'format_invalid'
    return { ok: false, errors }
  }

  const rawGroup = parseCount(values.groupCount)
  const rawWinner = parseCount(values.winnerQualifiersPerGroup)
  const rawConsolation = parseCount(values.consolationQualifiersPerGroup)

  let groupCount: number
  let winnerQualifiersPerGroup: number
  let consolationQualifiersPerGroup: number
  let thirdPlaceEnabled: boolean

  if (format === 'round_robin') {
    // Round-robin: only the group count matters. Qualification is meaningless → force 0.
    if (rawGroup === null || rawGroup < 1 || rawGroup > EVENT_GROUP_COUNT_MAX) {
      errors.groupCount = 'group_count_invalid'
    }
    groupCount = rawGroup ?? 1
    winnerQualifiersPerGroup = 0
    consolationQualifiersPerGroup = 0
    thirdPlaceEnabled = false
  } else if (format === 'knockout') {
    // Knockout: competitors are the entrants directly. Groups/qualifiers do not apply → neutralize
    // group_count to 1 (schema column is NOT NULL) and qualifiers to 0. Third place is kept.
    groupCount = 1
    winnerQualifiersPerGroup = 0
    consolationQualifiersPerGroup = 0
    thirdPlaceEnabled = !!values.thirdPlaceEnabled
  } else {
    // group_knockout: group stage feeds a championship (winner ≥ 1) and an optional consolation.
    if (rawGroup === null || rawGroup < 1 || rawGroup > EVENT_GROUP_COUNT_MAX) {
      errors.groupCount = 'group_count_invalid'
    }
    if (rawWinner === null || rawWinner < 1 || rawWinner > EVENT_QUALIFIERS_MAX) {
      errors.winnerQualifiersPerGroup = 'winner_qualifiers_invalid'
    }
    if (rawConsolation === null || rawConsolation < 0 || rawConsolation > EVENT_QUALIFIERS_MAX) {
      errors.consolationQualifiersPerGroup = 'consolation_qualifiers_invalid'
    }
    groupCount = rawGroup ?? 1
    winnerQualifiersPerGroup = rawWinner ?? 1
    consolationQualifiersPerGroup = rawConsolation ?? 0
    thirdPlaceEnabled = !!values.thirdPlaceEnabled
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name: name.slice(0, EVENT_NAME_MAX),
      format,
      groupCount,
      winnerQualifiersPerGroup,
      consolationQualifiersPerGroup,
      thirdPlaceEnabled,
    },
  }
}

/** Which setting fields are meaningful for a given format — drives conditional UI + reset logic. */
export function eventFieldVisibility(format: EventFormat): {
  groupCount: boolean
  winnerQualifiers: boolean
  consolationQualifiers: boolean
  thirdPlace: boolean
} {
  switch (format) {
    case 'round_robin':
      return { groupCount: true, winnerQualifiers: false, consolationQualifiers: false, thirdPlace: false }
    case 'knockout':
      return { groupCount: false, winnerQualifiers: false, consolationQualifiers: false, thirdPlace: true }
    case 'group_knockout':
      return { groupCount: true, winnerQualifiers: true, consolationQualifiers: true, thirdPlace: true }
  }
}
