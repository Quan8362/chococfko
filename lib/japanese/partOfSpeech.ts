// Maps raw part-of-speech codes (JMdict-style like "adj-i", "n", "v1" + legacy
// full-word values like "verb", "noun") to i18n key suffixes inside the
// `japanese` namespace. The UI never shows the raw code — it always renders the
// translated label via t(<returned key>). Raw DB values stay unchanged.

// Exact code → i18n key suffix (without the `pos_` prefix in the lookup, added below)
const EXACT_POS: Record<string, string> = {
  // JMdict-style codes
  'adj-i': 'adj_i',
  'adj-ix': 'adj_i',
  'adj-na': 'adj_na',
  'adj-no': 'adj_no',
  'adj-pn': 'adj_pn',
  'adv': 'adv',
  'adv-to': 'adv',
  'n': 'n',
  'v': 'v',
  'v1': 'v1',
  'v5': 'v5',
  'vs': 'vs',
  'vs-i': 'vs',
  'vs-s': 'vs',
  'vs-c': 'vs',
  'vt': 'vt',
  'vi': 'vi',
  'exp': 'exp',
  'prt': 'prt',
  'suf': 'suf',
  'pref': 'pref',
  // Legacy full-word values used by seed data / admin import
  'verb': 'v',
  'noun': 'n',
  'adjective': 'adjective',
  'adverb': 'adv',
  'particle': 'prt',
  'conjunction': 'conjunction',
  'interjection': 'interjection',
  'pronoun': 'pronoun',
}

/** Resolve a single raw POS code to its i18n key (e.g. "adj-i" → "pos_adj_i"). */
export function posKeySuffix(rawCode: string): string {
  const code = rawCode.trim().toLowerCase()
  if (!code) return 'pos_unknown'

  const exact = EXACT_POS[code]
  if (exact) return `pos_${exact}`

  // Fall back to prefix heuristics for JMdict variants not listed above.
  if (code.startsWith('adj-i')) return 'pos_adj_i'
  if (code.startsWith('adj-na')) return 'pos_adj_na'
  if (code.startsWith('adj-no')) return 'pos_adj_no'
  if (code.startsWith('adj-pn')) return 'pos_adj_pn'
  if (code.startsWith('adj')) return 'pos_adjective'
  if (code.startsWith('v1')) return 'pos_v1'
  if (code.startsWith('v5')) return 'pos_v5'
  if (code.startsWith('vs')) return 'pos_vs'
  if (code.startsWith('vt')) return 'pos_vt'
  if (code.startsWith('vi')) return 'pos_vi'
  if (code.startsWith('v')) return 'pos_v'
  if (code.startsWith('adv')) return 'pos_adv'
  if (code.startsWith('suf')) return 'pos_suf'
  if (code.startsWith('pref')) return 'pos_pref'
  if (code.startsWith('prt')) return 'pos_prt'
  if (code.startsWith('exp')) return 'pos_exp'
  if (code.startsWith('n')) return 'pos_n'

  return 'pos_unknown'
}

/**
 * Normalize a POS value into a clean list of raw codes.
 * Accepts a single string, a comma-separated string, an array, or null/undefined.
 */
export function normalizePosValue(value: string | string[] | null | undefined): string[] {
  if (value == null) return []
  const arr = Array.isArray(value) ? value : String(value).split(',')
  return arr.map(s => String(s).trim()).filter(Boolean)
}

/**
 * Resolve a POS value to a deduped list of i18n key suffixes ready for t().
 * Empty / null / undefined → [] (caller hides the section).
 * Unknown codes → "pos_unknown".
 */
export function getPartOfSpeechKeys(value: string | string[] | null | undefined): string[] {
  const codes = normalizePosValue(value)
  const seen = new Set<string>()
  const keys: string[] = []
  for (const code of codes) {
    const key = posKeySuffix(code)
    if (seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}
