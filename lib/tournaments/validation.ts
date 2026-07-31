// Pure, dependency-free validation shared by the admin tournament form (client) and the
// server actions (server). No I/O, no request-scoped server imports, no path-aliased imports →
// safe to import from Client Components AND runnable under `node --test`. Mirrors the DB CHECK
// constraints in
// supabase/migration_tournament_core.sql (name/slug not empty, ends_at >= starts_at, slug unique)
// so client + server + database agree.

// Normalize a user-entered URL to an absolute http(s) URL, or null if it cannot be a real web
// link. Mirrors lib/placeFields.normalizeUrl but inlined so this module stays dependency-free
// (the domain/validation layer must not pull in app-aliased code — see round-trip in tests).
export function normalizeRulesUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  let candidate = s
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(candidate)) candidate = `https://${candidate}`
    else return null
  }
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export const TOURNAMENT_NAME_MAX = 200
export const TOURNAMENT_SLUG_MAX = 80
export const TOURNAMENT_LOCATION_MAX = 200

// Stable machine codes → the UI localizes each; never surface raw strings.
export type TournamentFieldErrorCode =
  | 'name_required'
  | 'slug_invalid'
  | 'dates_order'
  | 'rules_url_invalid'

export type TournamentFieldKey = 'name' | 'slug' | 'dates' | 'rulesUrl'

export type TournamentFieldErrors = Partial<Record<TournamentFieldKey, TournamentFieldErrorCode>>

// Raw form values (all strings, as they arrive from inputs / the client payload). Dates are
// full ISO strings ('' when unset) so the same validator runs identically on client & server.
export interface TournamentFormValues {
  name: string
  slug: string
  startsAt: string
  endsAt: string
  location: string
  rulesUrl: string
}

// Cleaned values ready to write to the DB.
export interface NormalizedTournamentInput {
  name: string
  slug: string
  startsAt: string | null
  endsAt: string | null
  location: string | null
  rulesUrl: string | null
}

function toAsciiSlug(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * URL-safe slug derived from a tournament name. Prefers a clean ASCII slug (diacritics
 * stripped); falls back to a stable hashed slug for non-latin-only names so the result is
 * always non-empty and deterministic.
 */
export function slugifyTournament(name: string): string {
  const ascii = toAsciiSlug(name)
  if (ascii) return ascii.slice(0, TOURNAMENT_SLUG_MAX)
  const norm = (name ?? '').toLowerCase().trim()
  let h = 0
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0
  return 'giai-' + h.toString(36)
}

/** Normalize an admin-entered slug: lowercase, diacritic-free, url-safe, trimmed dashes. */
export function normalizeSlug(raw: string): string {
  return toAsciiSlug(raw).slice(0, TOURNAMENT_SLUG_MAX)
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validate + normalize a tournament form payload. Returns either the cleaned value ready for
 * the DB, or a map of field → error code. Slug is auto-derived from the name when left blank.
 */
export function validateTournamentInput(
  values: TournamentFormValues,
): { ok: true; value: NormalizedTournamentInput } | { ok: false; errors: TournamentFieldErrors } {
  const errors: TournamentFieldErrors = {}

  const name = (values.name ?? '').trim()
  if (!name) errors.name = 'name_required'

  // Slug: fall back to the slugified name when blank, then validate the final shape.
  let slug = normalizeSlug(values.slug || '')
  if (!slug && name) slug = slugifyTournament(name)
  if (!slug || !SLUG_RE.test(slug)) errors.slug = 'slug_invalid'

  const startsAt = (values.startsAt ?? '').trim() || null
  const endsAt = (values.endsAt ?? '').trim() || null
  if (startsAt && endsAt) {
    const s = new Date(startsAt).getTime()
    const e = new Date(endsAt).getTime()
    if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) errors.dates = 'dates_order'
  }

  let rulesUrl: string | null = null
  const rawUrl = (values.rulesUrl ?? '').trim()
  if (rawUrl) {
    rulesUrl = normalizeRulesUrl(rawUrl)
    if (!rulesUrl) errors.rulesUrl = 'rules_url_invalid'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name: name.slice(0, TOURNAMENT_NAME_MAX),
      slug,
      startsAt,
      endsAt,
      location: (values.location ?? '').trim().slice(0, TOURNAMENT_LOCATION_MAX) || null,
      rulesUrl,
    },
  }
}
