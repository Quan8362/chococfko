// qType → i18n keys for the learner-facing type label + instruction, and a
// stable cross-locale question signature for de-duplication. PURE module.

export type Jp60QType =
  | 'vocab_ja_to_meaning'
  | 'vocab_meaning_to_ja'
  | 'vocab_reading'
  | 'grammar_pattern_to_meaning'
  | 'grammar_meaning_to_pattern'
  | 'grammar_blank'
  | 'kanji_to_meaning'
  | 'kanji_meaning_to_char'
  | 'kanji_reading'

type Presentation = { labelKey: string; instrKey: string }

const MAP: Record<string, Presentation> = {
  vocab_ja_to_meaning: { labelKey: 'q_label_meaning', instrKey: 'q_instr_ja_to_meaning' },
  vocab_meaning_to_ja: { labelKey: 'q_label_meaning', instrKey: 'q_instr_meaning_to_ja' },
  vocab_reading: { labelKey: 'q_label_reading', instrKey: 'q_instr_reading' },
  kanji_to_meaning: { labelKey: 'q_label_kanji', instrKey: 'q_instr_kanji_meaning' },
  kanji_meaning_to_char: { labelKey: 'q_label_kanji', instrKey: 'q_instr_meaning_to_kanji' },
  kanji_reading: { labelKey: 'q_label_kanji', instrKey: 'q_instr_kanji_reading' },
  grammar_pattern_to_meaning: { labelKey: 'q_label_grammar', instrKey: 'q_instr_grammar_meaning' },
  grammar_meaning_to_pattern: { labelKey: 'q_label_grammar', instrKey: 'q_instr_grammar_pattern' },
  grammar_blank: { labelKey: 'q_label_sentence', instrKey: 'q_instr_sentence' },
}

const FALLBACK: Presentation = { labelKey: 'q_label_meaning', instrKey: 'q_instr_ja_to_meaning' }

export function questionPresentation(qType: string): Presentation {
  return MAP[qType] ?? FALLBACK
}

// FNV-1a hash of structural identity (NOT visible locale text, so the same
// underlying question collides regardless of UI language). Used to guarantee a
// session never serves two structurally identical questions.
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function questionSignature(q: {
  sourceType: string
  sourceId: string
  qType: string
}): string {
  return fnv1a(`${q.sourceType}|${q.sourceId}|${q.qType}`)
}
