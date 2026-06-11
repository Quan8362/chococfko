// Extract unique Kanji (CJK ideographs) from a Japanese string.
// Ignores Hiragana, Katakana, Latin letters, numbers, and punctuation.

// CJK Unified Ideographs (U+4E00–U+9FFF), Extension A (U+3400–U+4DBF),
// and Compatibility Ideographs (U+F900–U+FAFF).
const KANJI_RE = /[㐀-䶿一-鿿豈-﫿]/

export function extractKanji(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const ch of text) {
    if (seen.has(ch)) continue
    if (KANJI_RE.test(ch)) {
      seen.add(ch)
      out.push(ch)
    }
  }
  return out
}
