// ── Poker Alpha bug-report — PURE construction, validation & sanitisation ──────
//
// The in-game "Report a problem" flow attaches technical context so a tester's
// report is actionable without a screen-share. This module is the single place
// that decides WHAT context may travel with a report. It is pure (no DB / env /
// browser imports) so it is unit-testable and importable from anywhere.
//
// 🔴 PRIVACY IS THE WHOLE POINT OF THIS FILE. A bug report is user-authored and
// may be read by admins and pasted into tickets, so it must NEVER carry:
//   • auth tokens / passwords / service-role credentials
//   • unrevealed hole cards, the deck order, or the shuffle seed
//   • any other player's private state
// We enforce this with an ALLOWLIST: `sanitizeBugContext` copies ONLY the keys
// named below and drops everything else. A new sensitive field can never leak by
// accident — it has to be explicitly (and reviewably) added to the allowlist.

export const BUG_SEVERITIES = ['blocker', 'major', 'minor', 'cosmetic'] as const
export type BugSeverity = (typeof BUG_SEVERITIES)[number]

export function isBugSeverity(v: unknown): v is BugSeverity {
  return typeof v === 'string' && (BUG_SEVERITIES as readonly string[]).includes(v)
}

// A report is either a functional BUG or a UX-usability observation. The two share the same
// intake + privacy allowlist; the kind + UX category simply let the Alpha dashboard triage
// "the raise slider is imprecise" separately from "the game crashed".
export const REPORT_KINDS = ['bug', 'ux_feedback'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === 'string' && (REPORT_KINDS as readonly string[]).includes(v)
}

// The UX problem categories a tester can flag (visual-spec §UX-research). Mirrors the research
// task list: confusing action, layout, visual, terminology, sound/animation, plus a catch-all.
export const UX_CATEGORIES = [
  'confusing_action',
  'layout',
  'visual',
  'terminology',
  'sound_animation',
  'other',
] as const
export type UxCategory = (typeof UX_CATEGORIES)[number]

export function isUxCategory(v: unknown): v is UxCategory {
  return typeof v === 'string' && (UX_CATEGORIES as readonly string[]).includes(v)
}

// Optional 1–5 "how usable was this table" rating attached to UX feedback.
export const USABILITY_RATING_MIN = 1
export const USABILITY_RATING_MAX = 5

// The ONLY context keys allowed to leave the client with a report. Everything is
// non-sensitive, low-cardinality debugging metadata. Keep this list minimal.
export const ALLOWED_CONTEXT_KEYS = [
  'tableId',
  'handId',
  'seatIndex',
  'street',
  'phase',
  'stateVersion',
  'actionSeq',
  'lastEventId',
  'playerCount',
  'buildVersion',
  'browser',
  'os',
  'userAgent',
  'viewport',
  'orientation',
  'locale',
  'connectionState',
  'reconnectCount',
  'errorCode',
  'path',
  'timestamp',
  // UX-feedback fields (non-sensitive; carried in the same allowlisted context jsonb so no schema
  // change is required and the flow stays degrade-safe before any dashboard migration).
  'reportKind',
  'uxCategory',
  'usabilityRating',
  'uxTrail',
] as const
export type AllowedContextKey = (typeof ALLOWED_CONTEXT_KEYS)[number]

// Keys we explicitly recognise as dangerous. Only used by `containsSensitiveKey`
// as a defence-in-depth assertion in tests / server logs — the allowlist above
// is the real guarantee. Matching is case-insensitive and substring-based.
export const FORBIDDEN_KEY_FRAGMENTS = [
  'token',
  'password',
  'passwd',
  'secret',
  'authorization',
  'auth_header',
  'cookie',
  'service_role',
  'apikey',
  'api_key',
  'jwt',
  'bearer',
  'holecard',
  'hole_card',
  'holecards',
  'hole_cards',
  'deck',
  'seed',
  'shuffle',
] as const

export interface PokerBugContext {
  tableId?: string
  handId?: string
  seatIndex?: number
  street?: string
  phase?: string
  stateVersion?: number
  actionSeq?: number
  lastEventId?: string
  playerCount?: number
  buildVersion?: string
  browser?: string
  os?: string
  userAgent?: string
  viewport?: string
  orientation?: string
  locale?: string
  connectionState?: string
  reconnectCount?: number
  errorCode?: string
  path?: string
  timestamp?: string
  reportKind?: string
  uxCategory?: string
  usabilityRating?: number
  uxTrail?: string
}

export interface BugReportInput {
  description: string
  expected?: string
  actual?: string
  severity: BugSeverity
  contactOk: boolean
  screenshotUrl?: string
  context: PokerBugContext
}

export type BugReportError =
  | 'missing_description'
  | 'description_too_long'
  | 'field_too_long'
  | 'invalid_severity'
  | 'invalid_screenshot'

export interface ValidatedBugReport {
  description: string
  expected: string | null
  actual: string | null
  severity: BugSeverity
  contactOk: boolean
  screenshotUrl: string | null
  context: PokerBugContext
}

export const BUG_LIMITS = {
  description: 4000,
  field: 2000,
  string: 300, // per context string value
  screenshotUrl: 2000,
} as const

// Does a raw object carry a key that LOOKS sensitive? Recursive. Used as a tripwire
// (e.g. to refuse to persist an unexpected payload), not as the primary filter.
export function containsSensitiveKey(obj: unknown, depth = 0): boolean {
  if (depth > 6 || obj == null || typeof obj !== 'object') return false
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = k.toLowerCase()
    if (FORBIDDEN_KEY_FRAGMENTS.some((frag) => key.includes(frag))) return true
    if (v && typeof v === 'object' && containsSensitiveKey(v, depth + 1)) return true
  }
  return false
}

function clampStr(v: unknown, max = BUG_LIMITS.string): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return undefined
  return s.length > max ? s.slice(0, max) : s
}

function clampInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.trunc(Number(v))
  return undefined
}

const INT_KEYS = new Set<AllowedContextKey>(['seatIndex', 'stateVersion', 'actionSeq', 'reconnectCount', 'playerCount', 'usabilityRating'])

// Build a clean context object from an UNTRUSTED record. Only allow-listed keys
// survive; string values are trimmed & length-capped; numeric fields are coerced
// to integers. Anything not on the allowlist — including nested objects — is
// dropped entirely, so no hole cards / tokens / deck can ride along.
export function sanitizeBugContext(raw: unknown): PokerBugContext {
  const out: PokerBugContext = {}
  if (raw == null || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const key of ALLOWED_CONTEXT_KEYS) {
    const val = src[key]
    if (val == null) continue
    if (INT_KEYS.has(key)) {
      const n = clampInt(val)
      if (n !== undefined) (out as Record<string, unknown>)[key] = n
    } else {
      const s = clampStr(val)
      if (s !== undefined) (out as Record<string, unknown>)[key] = s
    }
  }
  // Enum/range guards for the UX-feedback fields: drop anything that is not a recognised value so
  // the stored context can only ever hold a valid kind/category/rating (defence in depth on top of
  // the UI's own <select>).
  if (out.reportKind !== undefined && !isReportKind(out.reportKind)) delete out.reportKind
  if (out.uxCategory !== undefined && !isUxCategory(out.uxCategory)) delete out.uxCategory
  if (out.usabilityRating !== undefined) {
    const r = out.usabilityRating
    if (r < USABILITY_RATING_MIN || r > USABILITY_RATING_MAX) delete out.usabilityRating
  }
  return out
}

// Only accept a screenshot reference that is a bounded http(s) or data:image URL.
function validScreenshot(v: string): boolean {
  if (v.length > BUG_LIMITS.screenshotUrl) return false
  return /^https?:\/\/\S+$/i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(v)
}

// Validate + normalise a full report. Sanitises the context here too so a caller
// can never persist an unsanitised context by mistake.
export function validateBugReport(input: BugReportInput): { ok: true; report: ValidatedBugReport } | { ok: false; error: BugReportError } {
  const description = (input.description ?? '').trim()
  if (!description) return { ok: false, error: 'missing_description' }
  if (description.length > BUG_LIMITS.description) return { ok: false, error: 'description_too_long' }

  if (!isBugSeverity(input.severity)) return { ok: false, error: 'invalid_severity' }

  const expected = (input.expected ?? '').trim()
  const actual = (input.actual ?? '').trim()
  if (expected.length > BUG_LIMITS.field || actual.length > BUG_LIMITS.field) {
    return { ok: false, error: 'field_too_long' }
  }

  let screenshotUrl: string | null = null
  const shot = (input.screenshotUrl ?? '').trim()
  if (shot) {
    if (!validScreenshot(shot)) return { ok: false, error: 'invalid_screenshot' }
    screenshotUrl = shot
  }

  return {
    ok: true,
    report: {
      description,
      expected: expected || null,
      actual: actual || null,
      severity: input.severity,
      contactOk: !!input.contactOk,
      screenshotUrl,
      context: sanitizeBugContext(input.context),
    },
  }
}

// Coarse device class derived from a viewport string "WxH" — used by the Alpha
// dashboard to bucket reports (desktop / tablet / phone) without extra client data.
export function deviceClassFromViewport(viewport: string | undefined | null): 'desktop' | 'tablet' | 'phone' | 'unknown' {
  if (!viewport) return 'unknown'
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(viewport.trim())
  if (!m) return 'unknown'
  const w = Number(m[1])
  if (!Number.isFinite(w) || w <= 0) return 'unknown'
  if (w >= 1024) return 'desktop'
  if (w >= 700) return 'tablet'
  return 'phone'
}
