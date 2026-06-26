/**
 * Kana → rōmaji converter (Hepburn).
 *
 * Standard chosen: **modified Hepburn with long vowels written out as vowel
 * sequences** (おう→ou, ゅう→yuu, えい→ei, ああ→aa, おお→oo). This keeps every
 * romaji keyboard-typable and unambiguous for learners — no macrons.
 *
 * The original imported `romaji` field collapsed long vowels (しゅうせい→"shusei",
 * たいおう→"taio"). The remedy is NOT a special long-vowel rule but simply a
 * mora-by-mora converter that never drops a vowel: しゅ+う+せ+い = "shuusei",
 * た+い+お+う = "taiou".
 *
 * Handles: gojūon + dakuten/handakuten, yōon (きゃ→kya), sokuon (っ→double
 * consonant, っち→tchi), syllabic ん (→n, →n' before a vowel or y), the katakana
 * long mark ー (→ repeat previous vowel), and common foreign combos (ファ→fa,
 * ティ→ti, ヴ→v…). Unknown characters pass through unchanged.
 */

// Two-kana combos (yōon + foreign), checked before single kana.
const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', しぇ: 'she',
  じゃ: 'ja',  じゅ: 'ju',  じょ: 'jo',  じぇ: 'je',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ちぇ: 'che',
  ぢゃ: 'ja',  ぢゅ: 'ju',  ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  // foreign / borrowed sounds (katakana normalised to hiragana before lookup)
  ふぁ: 'fa',  ふぃ: 'fi',  ふぇ: 'fe',  ふぉ: 'fo',  ふゅ: 'fyu',
  てぃ: 'ti',  てゅ: 'tyu', でぃ: 'di',  でゅ: 'dyu',
  とぅ: 'tu',  どぅ: 'du',
  うぃ: 'wi',  うぇ: 'we',  うぉ: 'wo',
  ゔぁ: 'va',  ゔぃ: 'vi',  ゔ: 'vu',    ゔぇ: 've',  ゔぉ: 'vo',
  くぁ: 'kwa', ぐぁ: 'gwa',
  しぃ: 'shi', いぇ: 'ye',
}

// Single kana → romaji.
const MONOGRAPHS: Record<string, string> = {
  あ: 'a',  い: 'i',  う: 'u',  え: 'e',  お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'o', ん: 'n',
  ゔ: 'vu',
  // small vowels left stranded → treated as their full vowel
  ぁ: 'a',  ぃ: 'i',  ぅ: 'u',  ぇ: 'e',  ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
  // spacing / punctuation commonly seen in readings
  '　': ' ', '・': ' ',
}

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o'])

/**
 * Particle-aware overrides for fixed phrase headwords whose は / へ / を are
 * grammatical particles, pronounced (and romanized) **wa / e / o** — not ha /
 * he / wo. A context-free mora converter cannot detect this from kana alone, and
 * a blanket "trailing は → wa" rule is wrong (はは=母 must stay "haha", かいわ is
 * already わ). So we whitelist the exact full readings where it is unambiguous.
 *
 * Keyed by the **normalized hiragana reading** (katakana folded, trimmed). This
 * applies to every surface that derives romaji (dictionary, JLPT cards,
 * flashcards) AND to the stored-romaji regeneration script, so search stays
 * consistent. Long-vowel handling is untouched — these are exact-match escapes.
 */
export const PARTICLE_PHRASE_OVERRIDES: Record<string, string> = {
  こんにちは: 'konnichiwa',
  こんばんは: 'konbanwa',
  では: 'dewa',
  それでは: 'soredewa',
  ではまた: 'dewamata',
}

/** Convert any katakana in the string to hiragana so one table covers both. */
function katakanaToHiragana(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    // Katakana block ァ(0x30A1)–ヶ(0x30F6) maps to hiragana by −0x60.
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60)
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Convert a kana reading to Hepburn rōmaji (long vowels written out).
 * Returns '' for empty input; passes unknown characters through unchanged.
 */
export function kanaToRomaji(input: string | null | undefined): string {
  if (!input) return ''
  const kana = katakanaToHiragana(input.trim())

  // Exact-match particle override (こんにちは → konnichiwa) takes precedence over
  // the mora converter, which would otherwise read は/へ/を as ha/he/wo.
  const override = PARTICLE_PHRASE_OVERRIDES[kana]
  if (override) return override

  const chars = Array.from(kana)
  let out = ''
  let pendingSokuon = false // っ seen, double the next consonant

  const emit = (roma: string) => {
    if (pendingSokuon && roma) {
      // っち → tchi (Hepburn); otherwise double the leading consonant.
      out += roma.startsWith('ch') ? 't' : roma[0]
      pendingSokuon = false
    }
    out += roma
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]

    // Sokuon — remember to double the next consonant.
    if (ch === 'っ') {
      pendingSokuon = true
      continue
    }

    // Long-vowel mark — repeat the previous emitted vowel.
    if (ch === 'ー') {
      const lastVowel = out.match(/[aiueo](?=[^aiueo]*$)/i)?.[0]
      if (lastVowel) out += lastVowel
      continue
    }

    // Syllabic ん — n, or n' before a vowel or y to avoid ambiguity (しんあい→shin'ai).
    if (ch === 'ん') {
      const nextRoma = next ? (MONOGRAPHS[next] ?? DIGRAPHS[next] ?? '') : ''
      const needsApostrophe = !!nextRoma && (VOWELS.has(nextRoma[0]) || nextRoma[0] === 'y')
      emit(needsApostrophe ? "n'" : 'n')
      continue
    }

    // Two-kana digraph (yōon / foreign) takes priority.
    if (next) {
      const digraph = DIGRAPHS[ch + next]
      if (digraph) {
        emit(digraph)
        i++
        continue
      }
    }

    const mono = MONOGRAPHS[ch]
    if (mono !== undefined) {
      emit(mono)
    } else {
      // Unknown character (kanji left in reading, latin, punctuation) — pass through.
      pendingSokuon = false
      out += ch
    }
  }

  return out
}

/**
 * Display romaji for a word: prefer regenerating from the authoritative kana
 * `reading` (always correct long vowels) and fall back to any stored romaji only
 * when there is no usable kana reading.
 */
export function displayRomaji(
  reading: string | null | undefined,
  storedRomaji?: string | null,
): string {
  const generated = reading ? kanaToRomaji(reading) : ''
  if (generated && /[a-z]/i.test(generated)) return generated
  return storedRomaji?.trim() || generated
}

/** Kanji (incl. extension-A and the iteration mark 々) — used to spot the kanji
 *  neighbours that disambiguate a kana particle from a word-internal kana. */
const KANJI_RE = /[一-龯㐀-䶿々]/

/** Grammatical particles read differently from their dictionary mora. */
const PARTICLE_ROMAJI: Record<string, string> = { は: 'wa', へ: 'e', を: 'o' }

/** Single-kana particles whose split is only trusted when a kanji sits beside
 *  them (so word-internal で/に/… inside a content word are left alone). */
const CONTEXTUAL_PARTICLES = new Set(['は', 'へ', 'が', 'に', 'で', 'と', 'も', 'の', 'や'])

/**
 * From the SURFACE headword, list the kana particles (in order) at which a
 * multi-word phrase should be split. を is always a particle; the others only
 * count when adjacent to a kanji — this keeps word-internal kana (でんわ の で)
 * from being mistaken for a particle.
 */
function phraseParticles(word: string): string[] {
  const chars = Array.from(word)
  const out: string[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === 'を') {
      out.push(c)
      continue
    }
    if (CONTEXTUAL_PARTICLES.has(c)) {
      const prev = chars[i - 1]
      const next = chars[i + 1]
      if ((prev && KANJI_RE.test(prev)) || (next && KANJI_RE.test(next))) out.push(c)
    }
  }
  return out
}

/**
 * Romaji for a phrase/idiom headword with spaces at word/particle boundaries,
 * e.g. 相好を崩す → "sougou o kuzusu", へそで茶を沸かす → "heso de cha o wakasu".
 *
 * Boundaries come from particles detected on the SURFACE word; the kana
 * `reading` is then split at those same particles and each segment romanized via
 * the untouched mora converter (long vowels preserved). When no phrase boundary
 * is found it returns the ordinary single-word romaji unchanged, so 東京 stays
 * "toukyou".
 */
export function displayPhraseRomaji(
  word: string | null | undefined,
  reading: string | null | undefined,
  storedRomaji?: string | null,
): string {
  const particles = word ? phraseParticles(word) : []
  if (!reading || particles.length === 0) return displayRomaji(reading, storedRomaji)

  const segments: string[] = []
  let cursor = 0
  for (const p of particles) {
    const idx = reading.indexOf(p, cursor)
    if (idx === -1) continue
    segments.push(reading.slice(cursor, idx)) // content before the particle
    segments.push(p)                          // the particle itself
    cursor = idx + p.length
  }
  segments.push(reading.slice(cursor)) // trailing content

  const romaji = segments
    .map((s) => (PARTICLE_ROMAJI[s] ?? kanaToRomaji(s)))
    .filter((s) => s.length > 0)
    .join(' ')

  return /[a-z]/i.test(romaji) ? romaji : displayRomaji(reading, storedRomaji)
}
