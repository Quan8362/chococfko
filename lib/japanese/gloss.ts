// Learner-facing gloss formatter for quiz prompts/options. PURE module.
//
// Imported dictionary meanings carry display-only annotations that must never
// reach a learner:
//   * Sino-Vietnamese reading labels in square brackets, e.g.
//     "[bắc] phía bắc, phương bắc; [bắc] thua trận"
//   * leading language codes ("vn:", "GB -")  (handled by cleanMeaningText)
//   * duplicated senses / stray separators / collapsed whitespace
//
// These helpers NEVER mutate the source; they produce a clean view. They never
// invent a translation — an empty/garbage source yields ''.
//
// Self-contained (no imports) so node --test can load it directly. Mirrors
// cleanMeaningText() from @/lib/sanitize for the leading language-code strip.

function cleanMeaningText(value?: string | null): string {
  if (!value) return ''
  return value
    .trim()
    .replace(/^(vn|vi|en|gb|jp|ja)\s*[:：\-–—]?\s*/i, '')
    .trim()
}

// A bracket group is treated as a display annotation (reading label / domain tag)
// — NOT meaning — when it has no sentence-terminal punctuation and is short.
// This matches "[bắc]", "[ngôn ngữ học]" etc. while leaving long bracketed text
// (which would be unusual for a gloss) untouched.
const ANNOTATION_BRACKET = /\[[^\]\n]{1,30}\]/g
const ANNOTATION_BRACKET_TEST = /\[[^\]\n]{1,30}\]/ // non-global twin for stateless .test()

// Collapse whitespace and tidy separators left behind after stripping brackets.
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*([;,])\s*/g, '$1 ')
    .replace(/(?:^[\s;,]+)|(?:[\s;,]+$)/g, '') // strip leading/trailing separators
    .replace(/([;,])\s*([;,])/g, '$1 ') // collapse doubled separators
    .trim()
}

// Split a gloss into sense groups (by ';') then individual glosses (by ',').
function senses(s: string): string[][] {
  return s
    .split(';')
    .map((group) => group.split(',').map((g) => g.trim()).filter(Boolean))
    .filter((group) => group.length > 0)
}

// Full cleaned meaning: annotations removed, duplicate glosses dropped, tidy.
// Use for review screens / explanations where showing all senses is helpful.
export function formatGloss(raw?: string | null): string {
  if (!raw) return ''
  const base = cleanMeaningText(raw).replace(ANNOTATION_BRACKET, ' ')
  const groups = senses(tidy(base))
  if (groups.length === 0) return ''
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    const items: string[] = []
    for (const g of group) {
      const key = g.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      items.push(g)
    }
    if (items.length) out.push(items.join(', '))
  }
  return out.join('; ')
}

// Concise primary sense for a QUESTION prompt or option — the first sense group
// only (so an unrelated later sense like "thua trận" never contaminates a
// kanji-identification question), capped to `maxItems` glosses.
export function primarySense(raw?: string | null, maxItems = 3): string {
  const cleaned = formatGloss(raw)
  if (!cleaned) return ''
  const first = cleaned.split(';')[0]
  const items: string[] = []
  const seen = new Set<string>()
  for (const g of first.split(',').map((x) => x.trim()).filter(Boolean)) {
    const key = g.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(g)
    if (items.length >= maxItems) break
  }
  return items.join(', ')
}

// True when a raw gloss still contains suspicious raw markers AFTER lang-code
// cleaning — used by the audit script to flag source rows for review.
export function hasRawMarkers(raw?: string | null): boolean {
  if (!raw) return false
  const s = cleanMeaningText(raw)
  return ANNOTATION_BRACKET_TEST.test(s) || /[<>{}]|&[a-z]+;|・{2,}/.test(s)
}
