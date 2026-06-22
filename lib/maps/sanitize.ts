// ============================================================
// Log/error sanitization (Map UX Phase 10). PURE/testable.
//
// Strips secrets and precise location from any string before it reaches a log,
// metric, or user-facing error: Google API keys, `key=` query params, bearer
// tokens, and lat,lng coordinate pairs. Used so error handling can surface a
// useful message without leaking keys or user coordinates.
// ============================================================

const PATTERNS: [RegExp, string][] = [
  [/AIza[0-9A-Za-z_-]{10,}/g, '[redacted-key]'],          // Google API key
  [/\b[Bb]earer\s+[A-Za-z0-9._-]{10,}/g, 'Bearer [redacted]'],
  [/(?<![\w-])(key|apikey|api_key|token|access_token)=[^&\s"']+/gi, '$1=[redacted]'],
  [/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[redacted-coords]'], // lat,lng
];

/** Redact secrets + precise coordinates from a string. Never throws. */
export function redactSensitive(input: string): string {
  let s = String(input ?? '');
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  return s;
}

/** Safe, bounded error message for logs/UX — redacted and length-capped. */
export function safeErrorMessage(err: unknown, max = 200): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown_error';
  return redactSensitive(raw).slice(0, max);
}
