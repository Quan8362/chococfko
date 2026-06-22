// NOTE: the rich-text HTML sanitizer `sanitizeHtml()` lives in the server-only
// module `@/lib/sanitizeHtml` so its Node-only `sanitize-html` dependency never
// reaches a client bundle. This file holds only client-safe string utilities.

// Recognised language/locale codes that imports sometimes prepend as metadata.
const LOCALE_CODES = 'vi|vn|en|gb|ja|jp|ko|zh'
// A code is metadata ONLY in an explicit, delimited/bracketed form. We must NOT
// strip a bare leading code, because that also matches the start of legitimate
// words ("việc", "viết", "vi phạm", "enjoy", …). Each pattern is anchored and
// requires a real boundary:
//   [vi] …        bracketed
//   vi: …  vi｜ …  colon / fullwidth-colon / pipe (optional surrounding spaces)
//   vi - …        dash with whitespace on BOTH sides (so "vi-X" and "vi phạm" are safe)
const LOCALE_BRACKET = new RegExp(`^\\[(?:${LOCALE_CODES})\\]\\s*`, 'i')
const LOCALE_DELIM = new RegExp(`^(?:${LOCALE_CODES})\\s*[:：|｜]\\s*`, 'i')
const LOCALE_DASH = new RegExp(`^(?:${LOCALE_CODES})\\s+[-–—]\\s+`, 'i')

/**
 * Remove a language-code metadata prefix ONLY when it appears in an explicit
 * bracketed/delimited form. Never removes the letters of a normal word that
 * merely begins with a code-like sequence. Returns the input otherwise unchanged.
 */
export function stripLocalePrefix(value: string): string {
  let s = value
  // A single pass is enough: each regex is ^-anchored and, after one strip, a
  // normal word will not match again. Apply each known form once.
  s = s.replace(LOCALE_BRACKET, '')
  s = s.replace(LOCALE_DELIM, '')
  s = s.replace(LOCALE_DASH, '')
  return s
}

/**
 * Clean a vocabulary meaning for display: trims and strips an explicit
 * language-code metadata prefix. Safe on already-clean data and on legitimate
 * Vietnamese words such as "việc"/"vi phạm" (which are left intact).
 */
export function cleanMeaningText(value?: string | null): string {
  if (!value) return ''
  return stripLocalePrefix(value.trim()).trim()
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
 * Heuristic: does this string look like rich HTML (from the TipTap editor)
 * rather than plain text? True if it contains a recognizable HTML tag.
 * Legacy plain-text descriptions ("price < 100", "<3") do not match because the
 * pattern requires `<` immediately followed by a letter or `/`.
 */
export function looksLikeHtml(value: string | null | undefined): boolean {
  if (!value) return false
  return /<\/?[a-z][\s\S]*?>/i.test(value)
}

/**
 * Does sanitized rich HTML actually carry content worth storing/showing, or is
 * it an empty editor (`<p></p>`)? True if there is visible text OR a block
 * element that has no text of its own (image, table, divider, callout).
 */
export function htmlHasContent(html: string | null | undefined): boolean {
  if (!html) return false
  if (stripHtml(html).length > 0) return true
  return /<(img|table|hr|figure)\b|data-callout/i.test(html)
}

/**
 * Convert legacy plain-text into safe HTML paragraphs so it loads cleanly into
 * the rich editor (preserving blank-line paragraph breaks and single line
 * breaks). Escapes HTML special chars first so stray `<`/`&` can't inject markup.
 */
export function plainTextToHtml(text: string | null | undefined): string {
  if (!text) return ''
  const esc = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
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
