// Dynamic practice question generation — pure helpers + types.
// DB access lives in app/japanese/practice-actions.ts; this module is import-safe
// from both server actions and client components (no 'use server', no Node deps).

import { cleanMeaningText } from '@/lib/sanitize'

export const PRACTICE_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number]

export const PRACTICE_TYPES = ['vocabulary', 'grammar', 'kanji', 'mixed'] as const
export type PracticeType = (typeof PRACTICE_TYPES)[number]

export const PRACTICE_COUNTS = [5, 10, 20, 30, 50] as const
// Hard ceiling so a single session never asks the DB for an unbounded amount.
export const MAX_QUESTIONS = 50

export type PracticeSourceType = 'vocabulary' | 'grammar' | 'kanji'

export type PracticeQType =
  | 'vocab_ja_to_meaning'
  | 'vocab_meaning_to_ja'
  | 'vocab_reading'
  | 'grammar_pattern_to_meaning'
  | 'grammar_meaning_to_pattern'
  | 'grammar_blank'
  | 'kanji_to_meaning'
  | 'kanji_meaning_to_char'
  | 'kanji_reading'

export type PracticeOption = { key: string; text: string }

export type PracticeQuestion = {
  id: string
  sourceType: PracticeSourceType
  sourceId: string
  qType: PracticeQType
  prompt: string
  promptSub: string | null
  options: PracticeOption[]
  correctKey: string
  explanation: string | null
}

const LETTERS = ['A', 'B', 'C', 'D'] as const

/* ── localisation ── */

type JsonMeaning = { vi?: string | null; en?: string | null } | null | undefined

// vi is the fallback meaning for vi/ja/ko/zh (matches the rest of the JP UI);
// en is used only when the EN locale is active.
export function pickMeaning(m: JsonMeaning, locale: string): string {
  if (!m) return ''
  const vi = cleanMeaningText(m.vi)
  const en = cleanMeaningText(m.en)
  return locale === 'en' ? en || vi : vi || en
}

/* ── randomness ── */

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ── option assembly ── */

type MCQBase = {
  sourceType: PracticeSourceType
  sourceId: string
  qType: PracticeQType
  prompt: string
  promptSub?: string | null
  explanation?: string | null
}

// Builds a 4-option multiple-choice question. Returns null when there aren't
// enough distinct distractors to make a fair question (caller skips it safely).
export function buildMCQ(
  base: MCQBase,
  correctText: string,
  distractorPool: string[]
): PracticeQuestion | null {
  const correct = correctText.trim()
  if (!correct) return null

  const seen = new Set<string>([correct.toLowerCase()])
  const distractors: string[] = []
  for (const raw of shuffle(distractorPool)) {
    const d = (raw ?? '').trim()
    if (!d) continue
    const key = d.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    distractors.push(d)
    if (distractors.length === 3) break
  }
  if (distractors.length < 3) return null

  const ordered = shuffle([correct, ...distractors])
  const options: PracticeOption[] = ordered.map((text, i) => ({ key: LETTERS[i], text }))
  const correctKey = options.find(o => o.text === correct)!.key

  return {
    id: `${base.sourceType}:${base.sourceId}:${base.qType}`,
    sourceType: base.sourceType,
    sourceId: base.sourceId,
    qType: base.qType,
    prompt: base.prompt,
    promptSub: base.promptSub ?? null,
    options,
    correctKey,
    explanation: base.explanation ?? null,
  }
}

/* ── mixed-practice distribution ── */

// 50% vocabulary / 30% grammar / 20% kanji, rounded, remainder to vocabulary.
export function splitMixed(total: number): { vocabulary: number; grammar: number; kanji: number } {
  const grammar = Math.round(total * 0.3)
  const kanji = Math.round(total * 0.2)
  const vocabulary = Math.max(0, total - grammar - kanji)
  return { vocabulary, grammar, kanji }
}

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 10
  return Math.min(MAX_QUESTIONS, Math.max(1, Math.floor(n)))
}
