// Pure, framework-free helpers for classifying and reporting client-side errors.
// Kept free of browser/Next globals so the logic is unit-testable with `node --test`.
// The browser-bound glue (navigator, window, fetch) lives in ./report.ts.

export type ErrorClass = 'chunk' | 'runtime'

export type ClientErrorReport = {
  incidentId: string
  name: string
  message: string
  stack: string | null
  digest: string | null
  errorClass: ErrorClass
  route: string | null
  roomCode: string | null
  buildId: string | null
  online: boolean | null
  channelStatus: string | null
  matchStatus: string | null
  loaded: { room: boolean; player: boolean; game: boolean } | null
  lastRealtimeEvent: string | null
  timestamp: string
  userAgent: string | null
}

// A normalized, serializable view of an unknown thrown value.
export type NormalizedError = {
  name: string
  message: string
  stack: string | null
  digest: string | null
}

/**
 * Coerce any thrown value (Error, string, object, null) into a stable shape.
 * Never throws; safe to call inside an error boundary.
 */
export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    const digest = (err as { digest?: unknown }).digest
    return {
      name: err.name || 'Error',
      message: err.message || String(err),
      stack: typeof err.stack === 'string' ? err.stack : null,
      digest: typeof digest === 'string' ? digest : null,
    }
  }
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    return {
      name: typeof o.name === 'string' ? o.name : 'Error',
      message: typeof o.message === 'string' ? o.message : safeStringify(o),
      stack: typeof o.stack === 'string' ? o.stack : null,
      digest: typeof o.digest === 'string' ? o.digest : null,
    }
  }
  return { name: 'Error', message: String(err), stack: null, digest: null }
}

function safeStringify(o: unknown): string {
  try {
    return JSON.stringify(o)
  } catch {
    return String(o)
  }
}

// Patterns that positively identify a failed JS/CSS chunk or dynamic-import load.
// These indicate the running bundle no longer matches what the server serves
// (typically a fresh deploy while an old tab is open), NOT a programming bug.
const CHUNK_PATTERNS: RegExp[] = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /'?text\/html'? is not a valid JavaScript MIME type/i,
  /importing a module script failed/i,
  /Unexpected token '<'/i, // HTML (404 page) returned where JS was expected
]

/**
 * True when the error is a stale-build / chunk-loading / dynamic-import failure.
 * Deliberately conservative: ordinary runtime errors must NOT match, so we never
 * trigger an auto-reload for a genuine code bug.
 */
export function isChunkLoadError(err: Pick<NormalizedError, 'name' | 'message'> | NormalizedError): boolean {
  if (err.name === 'ChunkLoadError') return true
  const haystack = `${err.name}: ${err.message}`
  return CHUNK_PATTERNS.some((re) => re.test(haystack))
}

export function classifyError(err: NormalizedError): ErrorClass {
  return isChunkLoadError(err) ? 'chunk' : 'runtime'
}

/**
 * Generate a short, human-quotable incident id (no PII). Prefix groups by area.
 */
export function genIncidentId(prefix = 'ERR'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${ts}-${rand}`.toUpperCase()
}

export type BuildReportInput = {
  err: NormalizedError
  incidentId: string
  route?: string | null
  roomCode?: string | null
  buildId?: string | null
  online?: boolean | null
  channelStatus?: string | null
  matchStatus?: string | null
  loaded?: { room: boolean; player: boolean; game: boolean } | null
  lastRealtimeEvent?: string | null
  userAgent?: string | null
  now?: number
}

/**
 * Assemble the structured report. Pure: every dynamic value is passed in, so the
 * same inputs always yield the same output (modulo the provided timestamp).
 */
export function buildErrorReport(input: BuildReportInput): ClientErrorReport {
  const { err } = input
  return {
    incidentId: input.incidentId,
    name: err.name,
    message: err.message,
    stack: err.stack ?? null,
    digest: err.digest ?? null,
    errorClass: classifyError(err),
    route: input.route ?? null,
    roomCode: input.roomCode ?? null,
    buildId: input.buildId ?? null,
    online: input.online ?? null,
    channelStatus: input.channelStatus ?? null,
    matchStatus: input.matchStatus ?? null,
    loaded: input.loaded ?? null,
    lastRealtimeEvent: input.lastRealtimeEvent ?? null,
    timestamp: new Date(input.now ?? Date.now()).toISOString(),
    userAgent: input.userAgent ?? null,
  }
}

// ── Controlled one-time reload guard ────────────────────────────────────────
// When a chunk error is detected we may reload ONCE to pick up the latest build.
// A per-key marker in sessionStorage prevents an infinite reload loop if the
// reload doesn't actually fix the problem.

export const RELOAD_GUARD_PREFIX = 'reload-guard:'

export type StorageLike = {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
}

/**
 * Decide whether a controlled reload is allowed for this error class + key.
 * Returns true at most once per key per session. Marks the key when it returns
 * true so a subsequent call (after the reload failed to help) returns false.
 *
 * `errorClass` must be 'chunk' — we never auto-reload ordinary runtime errors.
 */
export function shouldReloadForChunk(
  errorClass: ErrorClass,
  key: string,
  storage: StorageLike | null,
): boolean {
  if (errorClass !== 'chunk') return false
  if (!storage) return false
  const guardKey = RELOAD_GUARD_PREFIX + key
  try {
    if (storage.getItem(guardKey)) return false
    storage.setItem(guardKey, String(Date.now()))
    return true
  } catch {
    // sessionStorage unavailable (private mode quota, etc.) → do not loop.
    return false
  }
}
