'use server'

import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildMCQ,
  clampCount,
  pickMeaning,
  PRACTICE_LEVELS,
  PRACTICE_TYPES,
  shuffle,
  splitMixed,
  type PracticeLevel,
  type PracticeQuestion,
  type PracticeType,
} from '@/lib/japanese/practice'

type Supa = ReturnType<typeof createClient>

/* ── source row shapes ── */

type JsonMeaning = { vi?: string | null; en?: string | null }
type WordRow = { id: string; word: string; reading: string | null; meanings: JsonMeaning[] | null }
type GrammarRow = {
  id: string
  pattern: string
  meaning_vi: string | null
  meaning_en: string | null
  examples: { ja?: string; reading?: string; vi?: string; en?: string }[] | null
}
type KanjiRow = {
  id: string
  character: string
  onyomi: string[] | null
  kunyomi: string[] | null
  meanings: JsonMeaning[] | null
}

function firstMeaning(m: JsonMeaning[] | null): JsonMeaning | null {
  return Array.isArray(m) && m.length > 0 ? m[0] : null
}

// Fetch a random window of published rows for a level. We use count + a random
// offset + range() so we never pull the whole 15k-row table client-side and the
// query stays on the jlpt_level / is_published indexes.
async function fetchPool<T>(
  supabase: Supa,
  table: 'japanese_words' | 'japanese_grammar' | 'japanese_kanji',
  level: PracticeLevel,
  columns: string,
  need: number
): Promise<T[]> {
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('jlpt_level', level)
    .eq('is_published', true)

  const total = count ?? 0
  if (total === 0) return []

  const poolSize = Math.min(total, Math.max(150, need * 8))
  const maxOffset = Math.max(0, total - poolSize)
  const offset = Math.floor(Math.random() * (maxOffset + 1))

  const { data } = await supabase
    .from(table)
    .select(columns)
    .eq('jlpt_level', level)
    .eq('is_published', true)
    .order('id', { ascending: true })
    .range(offset, offset + poolSize - 1)

  return (data ?? []) as T[]
}

/* ── generators ── */

function genVocab(rows: WordRow[], count: number, locale: string): PracticeQuestion[] {
  const enriched = rows
    .map(r => ({
      id: r.id,
      word: (r.word ?? '').trim(),
      reading: (r.reading ?? '').trim(),
      meaning: pickMeaning(firstMeaning(r.meanings), locale),
    }))
    .filter(r => r.word && r.meaning)

  const out: PracticeQuestion[] = []
  for (const r of shuffle(enriched)) {
    if (out.length >= count) break
    const others = enriched.filter(o => o.id !== r.id)
    const hasReading = !!r.reading && r.reading !== r.word
    const types = ['vocab_ja_to_meaning', 'vocab_meaning_to_ja', ...(hasReading ? ['vocab_reading'] : [])]
    const qType = types[Math.floor(Math.random() * types.length)] as PracticeQuestion['qType']
    const readingNote = r.reading ? `${r.word}（${r.reading}）` : r.word

    let q: PracticeQuestion | null = null
    if (qType === 'vocab_ja_to_meaning') {
      q = buildMCQ(
        { sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, promptSub: r.reading || null, explanation: readingNote },
        r.meaning,
        others.map(o => o.meaning)
      )
    } else if (qType === 'vocab_meaning_to_ja') {
      q = buildMCQ(
        { sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.meaning, explanation: `${readingNote} = ${r.meaning}` },
        r.word,
        others.map(o => o.word)
      )
    } else {
      q = buildMCQ(
        { sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, explanation: r.meaning },
        r.reading,
        others.filter(o => o.reading && o.reading !== o.word).map(o => o.reading)
      )
    }
    if (q) out.push(q)
  }
  return out
}

function genGrammar(rows: GrammarRow[], count: number, locale: string): PracticeQuestion[] {
  const enriched = rows
    .map(r => ({
      id: r.id,
      pattern: (r.pattern ?? '').trim(),
      meaning: locale === 'en' ? (r.meaning_en || r.meaning_vi || '').trim() : (r.meaning_vi || r.meaning_en || '').trim(),
      examples: Array.isArray(r.examples) ? r.examples : [],
    }))
    .filter(r => r.pattern && r.meaning)

  const out: PracticeQuestion[] = []
  for (const r of shuffle(enriched)) {
    if (out.length >= count) break
    const others = enriched.filter(o => o.id !== r.id)
    const core = r.pattern.replace(/[〜～\s]/g, '')

    // Conservative blank-fill: only when an example literally contains the pattern core.
    const blankEx =
      core.length >= 2
        ? r.examples.find(ex => typeof ex.ja === 'string' && ex.ja.includes(core))
        : undefined

    const types: PracticeQuestion['qType'][] = ['grammar_pattern_to_meaning', 'grammar_meaning_to_pattern']
    if (blankEx) types.push('grammar_blank')
    const qType = types[Math.floor(Math.random() * types.length)]

    let q: PracticeQuestion | null = null
    if (qType === 'grammar_pattern_to_meaning') {
      q = buildMCQ(
        { sourceType: 'grammar', sourceId: r.id, qType, prompt: r.pattern, explanation: r.meaning },
        r.meaning,
        others.map(o => o.meaning)
      )
    } else if (qType === 'grammar_meaning_to_pattern') {
      q = buildMCQ(
        { sourceType: 'grammar', sourceId: r.id, qType, prompt: r.meaning, explanation: `${r.pattern} = ${r.meaning}` },
        r.pattern,
        others.map(o => o.pattern)
      )
    } else if (blankEx) {
      const sub = locale === 'en' ? blankEx.en : blankEx.vi
      q = buildMCQ(
        {
          sourceType: 'grammar',
          sourceId: r.id,
          qType,
          prompt: blankEx.ja!.replace(core, '＿＿'),
          promptSub: sub || null,
          explanation: `${r.pattern} = ${r.meaning}`,
        },
        core,
        others.map(o => o.pattern.replace(/[〜～\s]/g, '')).filter(c => c.length >= 2)
      )
    }
    if (q) out.push(q)
  }
  return out
}

function genKanji(rows: KanjiRow[], count: number, locale: string): PracticeQuestion[] {
  const enriched = rows
    .map(r => ({
      id: r.id,
      character: (r.character ?? '').trim(),
      meaning: pickMeaning(firstMeaning(r.meanings), locale),
      readings: [...(r.onyomi ?? []), ...(r.kunyomi ?? [])].map(s => (s ?? '').trim()).filter(Boolean),
    }))
    .filter(r => r.character && r.meaning)

  const out: PracticeQuestion[] = []
  for (const r of shuffle(enriched)) {
    if (out.length >= count) break
    const others = enriched.filter(o => o.id !== r.id)
    const hasReading = r.readings.length > 0
    const types: PracticeQuestion['qType'][] = ['kanji_to_meaning', 'kanji_meaning_to_char']
    if (hasReading) types.push('kanji_reading')
    const qType = types[Math.floor(Math.random() * types.length)]
    const readingNote = r.readings.join('、')

    let q: PracticeQuestion | null = null
    if (qType === 'kanji_to_meaning') {
      q = buildMCQ(
        { sourceType: 'kanji', sourceId: r.id, qType, prompt: r.character, promptSub: readingNote || null, explanation: r.meaning },
        r.meaning,
        others.map(o => o.meaning)
      )
    } else if (qType === 'kanji_meaning_to_char') {
      q = buildMCQ(
        { sourceType: 'kanji', sourceId: r.id, qType, prompt: r.meaning, explanation: `${r.character} = ${r.meaning}` },
        r.character,
        others.map(o => o.character)
      )
    } else {
      const correct = r.readings[Math.floor(Math.random() * r.readings.length)]
      q = buildMCQ(
        { sourceType: 'kanji', sourceId: r.id, qType, prompt: r.character, explanation: `${r.character} = ${r.meaning}` },
        correct,
        others.flatMap(o => o.readings)
      )
    }
    if (q) out.push(q)
  }
  return out
}

/* ── public: generate a session ── */

async function genForType(
  supabase: Supa,
  type: 'vocabulary' | 'grammar' | 'kanji',
  level: PracticeLevel,
  count: number,
  locale: string
): Promise<PracticeQuestion[]> {
  if (count <= 0) return []
  if (type === 'vocabulary') {
    const rows = await fetchPool<WordRow>(supabase, 'japanese_words', level, 'id,word,reading,meanings', count)
    return genVocab(rows, count, locale)
  }
  if (type === 'grammar') {
    const rows = await fetchPool<GrammarRow>(supabase, 'japanese_grammar', level, 'id,pattern,meaning_vi,meaning_en,examples', count)
    return genGrammar(rows, count, locale)
  }
  const rows = await fetchPool<KanjiRow>(supabase, 'japanese_kanji', level, 'id,character,onyomi,kunyomi,meanings', count)
  return genKanji(rows, count, locale)
}

export async function generatePracticeQuestions(
  levelInput: string,
  typeInput: string,
  countInput: number
): Promise<{ questions: PracticeQuestion[]; error?: string }> {
  const level = String(levelInput).toUpperCase() as PracticeLevel
  if (!PRACTICE_LEVELS.includes(level)) return { questions: [], error: 'invalid_level' }
  const type = typeInput as PracticeType
  if (!PRACTICE_TYPES.includes(type)) return { questions: [], error: 'invalid_type' }
  const count = clampCount(countInput)

  const supabase = createClient()
  const locale = await getLocale()

  let questions: PracticeQuestion[] = []

  if (type === 'mixed') {
    const split = splitMixed(count)
    const [v, g, k] = await Promise.all([
      genForType(supabase, 'vocabulary', level, split.vocabulary, locale),
      genForType(supabase, 'grammar', level, split.grammar, locale),
      genForType(supabase, 'kanji', level, split.kanji, locale),
    ])
    questions = [...v, ...g, ...k]
    // Top up from vocabulary if a source came up short, so mixed still fills out.
    if (questions.length < count) {
      const extra = await genForType(supabase, 'vocabulary', level, count - questions.length + 4, locale)
      const seen = new Set(questions.map(q => q.id))
      for (const q of extra) {
        if (questions.length >= count) break
        if (!seen.has(q.id)) {
          seen.add(q.id)
          questions.push(q)
        }
      }
    }
    questions = shuffle(questions).slice(0, count)
  } else {
    questions = await genForType(supabase, type, level, count, locale)
  }

  if (questions.length === 0) return { questions: [], error: 'empty' }
  return { questions }
}

/* ── availability (counts shown on the setup screen) ── */

export type PracticeAvailability = Record<PracticeLevel, { vocabulary: number; grammar: number; kanji: number }>

export async function getPracticeAvailability(): Promise<PracticeAvailability> {
  const supabase = createClient()
  const tables = [
    ['vocabulary', 'japanese_words'],
    ['grammar', 'japanese_grammar'],
    ['kanji', 'japanese_kanji'],
  ] as const

  const result = {} as PracticeAvailability
  await Promise.all(
    PRACTICE_LEVELS.map(async level => {
      const counts = await Promise.all(
        tables.map(async ([, table]) => {
          const { count } = await supabase
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('jlpt_level', level)
            .eq('is_published', true)
          return count ?? 0
        })
      )
      result[level] = { vocabulary: counts[0], grammar: counts[1], kanji: counts[2] }
    })
  )
  return result
}

/* ── history: save a finished session + per-answer rows ── */

export type PracticeAnswerInput = {
  sourceType: string
  sourceId: string
  qType: string
  questionText: string
  correctAnswer: string
  selectedAnswer: string | null
  isCorrect: boolean
}

export type SavePracticeInput = {
  level: string
  type: string
  durationSec: number
  answers: PracticeAnswerInput[]
}

const VALID_SOURCE = ['vocabulary', 'grammar', 'kanji']

export async function savePracticeSession(
  input: SavePracticeInput
): Promise<{ success: boolean; error?: string }> {
  const level = String(input.level).toUpperCase()
  if (!PRACTICE_LEVELS.includes(level as PracticeLevel)) return { success: false, error: 'invalid_level' }
  if (!PRACTICE_TYPES.includes(input.type as PracticeType)) return { success: false, error: 'invalid_type' }
  if (!Array.isArray(input.answers) || input.answers.length === 0 || input.answers.length > 100) {
    return { success: false, error: 'invalid_answers' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const total = input.answers.length
  const correct = input.answers.filter(a => a.isCorrect).length
  const wrong = total - correct
  const scorePercent = Math.round((correct / total) * 100)

  const { data: session, error: sessionErr } = await supabase
    .from('japanese_practice_sessions')
    .insert({
      user_id: user.id,
      jlpt_level: level,
      practice_type: input.type,
      question_count: total,
      correct_count: correct,
      wrong_count: wrong,
      score_percent: scorePercent,
      duration_sec: Math.max(0, Math.min(86400, Math.floor(input.durationSec || 0))),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (sessionErr || !session) return { success: false, error: sessionErr?.message ?? 'insert_failed' }

  const rows = input.answers.slice(0, 100).map(a => ({
    session_id: session.id,
    user_id: user.id,
    question_type: String(a.qType).slice(0, 60),
    source_type: VALID_SOURCE.includes(a.sourceType) ? a.sourceType : 'vocabulary',
    source_id: String(a.sourceId).slice(0, 64),
    question_text: String(a.questionText).slice(0, 500),
    correct_answer: String(a.correctAnswer).slice(0, 300),
    selected_answer: a.selectedAnswer == null ? null : String(a.selectedAnswer).slice(0, 300),
    is_correct: !!a.isCorrect,
  }))

  const { error: answersErr } = await supabase.from('japanese_practice_answers').insert(rows)
  if (answersErr) return { success: false, error: answersErr.message }

  return { success: true }
}

/* ── history: recent sessions + weak areas for the logged-in user ── */

export type RecentSession = {
  id: string
  jlpt_level: string
  practice_type: string
  question_count: number
  correct_count: number
  score_percent: number
  completed_at: string | null
}

export async function getRecentPracticeSessions(limit = 5): Promise<RecentSession[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('japanese_practice_sessions')
    .select('id,jlpt_level,practice_type,question_count,correct_count,score_percent,completed_at')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(20, Math.max(1, limit)))

  return (data ?? []) as RecentSession[]
}

export type WeakArea = { source_type: string; wrong: number; total: number }

export async function getWeakAreas(): Promise<WeakArea[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Aggregate the last 500 answers in JS (keeps us off RPCs while the report stays small).
  const { data } = await supabase
    .from('japanese_practice_answers')
    .select('source_type,is_correct')
    .eq('user_id', user.id)
    .order('answered_at', { ascending: false })
    .limit(500)

  const acc = new Map<string, { wrong: number; total: number }>()
  for (const row of data ?? []) {
    const key = (row as { source_type: string }).source_type
    const e = acc.get(key) ?? { wrong: 0, total: 0 }
    e.total += 1
    if (!(row as { is_correct: boolean }).is_correct) e.wrong += 1
    acc.set(key, e)
  }
  return Array.from(acc, ([source_type, v]) => ({ source_type, ...v }))
    .filter(a => a.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
}
