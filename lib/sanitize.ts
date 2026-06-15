// NOTE: the rich-text HTML sanitizer `sanitizeHtml()` lives in the server-only
// module `@/lib/sanitizeHtml` so its Node-only `sanitize-html` dependency never
// reaches a client bundle. This file holds only client-safe string utilities.

/**
 * Remove accidental language-code prefixes (e.g. "vn", "GB") from vocabulary
 * meaning text that may have been baked in during dictionary imports.
 * Also safe to call on clean data — has no effect if no prefix is present.
 */
export function cleanMeaningText(value?: string | null): string {
  if (!value) return ''
  return value
    .trim()
    .replace(/^(vn|vi|en|gb|jp|ja)\s*[:：\-–—]?\s*/i, '')
    .trim()
}

/**
 * Strip all HTML tags and decode basic entities to get plain text.
 * Used to measure content length without counting HTML markup.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Plain-text sanitizer for user profile fields (name, area, bio).
 * Decodes basic entities FIRST so that entity-encoded markup
 * (e.g. "&lt;img src=x onerror=alert(1)&gt;") is also removed, then strips all
 * tags and stray angle brackets. Nothing executes (these render as React text),
 * but this keeps raw markup/code from showing in the UI.
 */
export function sanitizeUserText(input: string | null | undefined, maxLen = 500): string {
  if (!input) return ''
  let s = String(input)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0*60;/g, '<')
    .replace(/&#0*62;/g, '>')
  // Remove script/style/etc. blocks WITH their contents first — otherwise just
  // stripping the tags leaves the JS/CSS body as visible text.
  s = s
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<(?:iframe|object|noscript|template)[\s\S]*?<\/(?:iframe|object|noscript|template)\s*>/gi, '')
    // A lone opening <script ...> with no close → drop the rest of the string.
    .replace(/<(?:script|style)\b[\s\S]*$/gi, '')
  s = s.replace(/<[^>]*>/g, '') // strip remaining <…> tags (incl. <img …>)
  s = s.replace(/[<>]/g, '')    // drop any leftover angle brackets
  return s.trim().slice(0, maxLen)
}

/** Single-line variant (collapses whitespace) — for display name / area. */
export function sanitizeUserName(input: string | null | undefined, maxLen = 60): string {
  return sanitizeUserText(input, maxLen).replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

/** Only allow http(s) links; reject javascript:/data:/etc. Returns '' if unsafe. */
export function sanitizeUrl(input: string | null | undefined, maxLen = 500): string {
  if (!input) return ''
  const s = String(input).trim()
  if (!/^https?:\/\//i.test(s)) return ''
  if (/[<>"'\s]/.test(s)) return ''
  return s.slice(0, maxLen)
}
