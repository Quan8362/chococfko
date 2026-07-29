// Pure, dependency-free validation for tournament COMPETITORS (vận động viên / cặp / đội). Shared
// by the admin competitor UI (client) and the server actions (server). No I/O, no server-only
// imports → safe in Client Components AND runnable under `node --test`.
//
// A competitor in V1 may be a single player, a pair, or a team — it is just an admin-entered name
// (NOT an auth.users row). Mirrors the DB CHECK on tournament_competitors (name not empty).

export const COMPETITOR_NAME_MAX = 120
export const COMPETITOR_SHORT_NAME_MAX = 40
export const COMPETITOR_SEED_MAX = 9999
// Upper bound on a single bulk paste so a runaway textarea cannot try to insert 10^6 rows.
export const BULK_MAX_LINES = 256

export type CompetitorFieldErrorCode =
  | 'name_required'
  | 'name_too_long'
  | 'short_name_too_long'
  | 'seed_invalid'
  // Set by the SERVER action (not the pure validator) when the name collides with another
  // competitor in the same event — duplicates are guarded at the application layer since the
  // schema has no unique(event_id, name) constraint.
  | 'name_duplicate'

export type CompetitorFieldKey = 'name' | 'shortName' | 'seed'

export type CompetitorFieldErrors = Partial<Record<CompetitorFieldKey, CompetitorFieldErrorCode>>

export interface CompetitorFormValues {
  name: string
  shortName: string
  seed: string
}

export interface NormalizedCompetitorInput {
  name: string
  shortName: string | null
  seed: number | null
}

/**
 * Canonical form of a competitor name: trim, collapse internal whitespace runs to a single space.
 * Used for storage AND as the basis of the (lowercased) duplicate-detection key so "Anh  Tú" and
 * "Anh Tú " are treated as the same name ("không phân biệt khoảng trắng thừa").
 */
export function normalizeCompetitorName(raw: string): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
}

/** Case-insensitive dedup key derived from the normalized name. */
export function competitorNameKey(raw: string): string {
  return normalizeCompetitorName(raw).toLowerCase()
}

/** Validate + normalize a single competitor form payload. */
export function validateCompetitorInput(
  values: CompetitorFormValues,
): { ok: true; value: NormalizedCompetitorInput } | { ok: false; errors: CompetitorFieldErrors } {
  const errors: CompetitorFieldErrors = {}

  const name = normalizeCompetitorName(values.name)
  if (!name) errors.name = 'name_required'
  else if (name.length > COMPETITOR_NAME_MAX) errors.name = 'name_too_long'

  const shortRaw = normalizeCompetitorName(values.shortName)
  if (shortRaw.length > COMPETITOR_SHORT_NAME_MAX) errors.shortName = 'short_name_too_long'

  let seed: number | null = null
  const seedRaw = (values.seed ?? '').trim()
  if (seedRaw !== '') {
    if (!/^\d+$/.test(seedRaw)) {
      errors.seed = 'seed_invalid'
    } else {
      const n = Number(seedRaw)
      if (!Number.isSafeInteger(n) || n < 1 || n > COMPETITOR_SEED_MAX) errors.seed = 'seed_invalid'
      else seed = n
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { name, shortName: shortRaw || null, seed },
  }
}

export interface BulkParse {
  // Cleaned, trimmed, whitespace-collapsed lines in original order (blank lines dropped).
  readonly cleaned: readonly string[]
  // First occurrence of each name (original casing kept) — the set that would actually be inserted.
  readonly unique: readonly string[]
  // Names that appear more than once within the input (normalized display form), for the UI.
  readonly duplicateNames: readonly string[]
  // True when the input exceeds BULK_MAX_LINES cleaned lines.
  readonly tooMany: boolean
}

/**
 * Parse a bulk-add textarea (one competitor per line): trim every line, drop blanks, collapse
 * excess whitespace, and detect names duplicated within the input (case-insensitive). Pure — the
 * client uses it for a live preview and the server re-runs it before writing so the two agree.
 */
export function parseBulkCompetitors(raw: string): BulkParse {
  const cleaned: string[] = []
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const n = normalizeCompetitorName(line)
    if (n) cleaned.push(n)
  }

  const seen = new Map<string, string>() // key → first-seen display name
  const dupKeys = new Set<string>()
  const unique: string[] = []
  for (const n of cleaned) {
    const key = n.toLowerCase()
    if (seen.has(key)) {
      dupKeys.add(key)
    } else {
      seen.set(key, n)
      unique.push(n)
    }
  }

  return {
    cleaned,
    unique,
    duplicateNames: Array.from(dupKeys).map((k) => seen.get(k) as string),
    tooMany: cleaned.length > BULK_MAX_LINES,
  }
}
