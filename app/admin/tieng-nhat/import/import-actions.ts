'use server'

import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
}

export type ImportResult = {
  success: number
  failed: number
  errors: string[]
}

export type ImportWordRow = {
  word: string
  reading?: string | null
  romaji?: string | null
  jlpt_level?: string | null
  pos?: string[] | null
  meanings?: { vi: string; en: string }[] | null
  examples?: unknown
  tags?: string[] | null
  frequency?: number
}

export type ImportKanjiRow = {
  character: string
  jlpt_level?: string | null
  onyomi?: string[] | null
  kunyomi?: string[] | null
  meanings?: { vi: string; en: string }[] | null
  stroke_count?: number | null
  radical?: string | null
  examples?: unknown
}

export type ImportGrammarRow = {
  pattern: string
  jlpt_level?: string | null
  meaning_vi?: string | null
  meaning_en?: string | null
  structure?: string | null
  notes?: string | null
  examples?: unknown
  tags?: string[] | null
}

export type ImportQuizRow = {
  jlpt_level?: string | null
  category?: string
  question: string
  question_reading?: string | null
  question_vi?: string | null
  question_en?: string | null
  options: { key: string; text: string }[]
  correct_answer: string
  explanation_vi?: string | null
  explanation_en?: string | null
  difficulty?: string
}

type PgResponse = { error: { message: string } | null }

// Chunked insert — tries bulk first, falls back to row-by-row on error
async function insertChunked<T extends object>(
  rows: T[],
  insertFn: (chunk: T[]) => PromiseLike<PgResponse>,
  startOffset = 0
): Promise<ImportResult> {
  const CHUNK = 100
  let success = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await insertFn(chunk)

    if (error) {
      for (let j = 0; j < chunk.length; j++) {
        const { error: rowErr } = await insertFn([chunk[j]])
        if (rowErr) {
          failed++
          errors.push(`Dòng ${startOffset + i + j + 1}: ${rowErr.message}`)
        } else {
          success++
        }
      }
    } else {
      success += chunk.length
    }
  }

  return { success, failed, errors }
}

export async function importWords(rows: ImportWordRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    word: r.word,
    reading: r.reading || null,
    romaji: r.romaji || null,
    jlpt_level: r.jlpt_level || null,
    pos: r.pos?.length ? r.pos : null,
    meanings: r.meanings?.length ? r.meanings : null,
    examples: r.examples || null,
    tags: r.tags?.length ? r.tags : null,
    frequency: r.frequency ?? 0,
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk => admin.from('japanese_words').insert(chunk))
}

export async function importKanji(rows: ImportKanjiRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    character: r.character,
    jlpt_level: r.jlpt_level || null,
    onyomi: r.onyomi?.length ? r.onyomi : null,
    kunyomi: r.kunyomi?.length ? r.kunyomi : null,
    meanings: r.meanings?.length ? r.meanings : null,
    stroke_count: r.stroke_count || null,
    radical: r.radical || null,
    examples: r.examples || null,
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk =>
    admin.from('japanese_kanji').upsert(chunk, { onConflict: 'character', ignoreDuplicates: false })
  )
}

export async function importGrammar(rows: ImportGrammarRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    pattern: r.pattern,
    jlpt_level: r.jlpt_level || null,
    meaning_vi: r.meaning_vi || null,
    meaning_en: r.meaning_en || null,
    structure: r.structure || null,
    notes: r.notes || null,
    examples: r.examples || null,
    tags: r.tags?.length ? r.tags : null,
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk =>
    admin.from('japanese_grammar').upsert(chunk, { onConflict: 'pattern', ignoreDuplicates: false })
  )
}

export async function importQuiz(rows: ImportQuizRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    jlpt_level: r.jlpt_level || null,
    category: r.category || 'mixed',
    question: r.question,
    question_reading: r.question_reading || null,
    question_vi: r.question_vi || null,
    question_en: r.question_en || null,
    options: r.options,
    correct_answer: r.correct_answer,
    explanation_vi: r.explanation_vi || null,
    explanation_en: r.explanation_en || null,
    difficulty: r.difficulty || 'medium',
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk => admin.from('jp_quiz_questions').insert(chunk))
}
