'use server'

import { createClient } from '@/lib/supabase/server'

export type QuizQuestion = {
  id: string
  jlpt_level: string
  category: string
  question: string
  question_reading: string | null
  question_vi: string | null
  question_en: string | null
  options: { key: string; text: string }[]
  correct_answer: string
  explanation_vi: string | null
  explanation_en: string | null
  difficulty: string
}

export async function getQuizQuestions(
  level: string,
  category: string,
  limit: number
): Promise<{ questions: QuizQuestion[]; error?: string }> {
  const supabase = createClient()

  let query = supabase
    .from('jp_quiz_questions')
    .select(
      'id,jlpt_level,category,question,question_reading,question_vi,question_en,options,correct_answer,explanation_vi,explanation_en,difficulty'
    )
    .eq('jlpt_level', level.toUpperCase())
    .eq('is_published', true)

  if (category !== 'mixed') {
    query = query.eq('category', category)
  }

  const { data, error } = await query.limit(100)

  if (error) return { questions: [], error: error.message }
  if (!data || data.length === 0) return { questions: [] }

  const shuffled = [...data].sort(() => Math.random() - 0.5)
  return { questions: shuffled.slice(0, limit) as QuizQuestion[] }
}

export async function getExamQuestions(
  level: string,
  limit = 20
): Promise<QuizQuestion[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('jp_quiz_questions')
    .select(
      'id,jlpt_level,category,question,question_reading,question_vi,question_en,options,correct_answer,explanation_vi,explanation_en,difficulty'
    )
    .eq('jlpt_level', level.toUpperCase())
    .eq('is_published', true)
    .limit(100)

  if (!data || data.length === 0) return []
  const shuffled = [...data].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, limit) as QuizQuestion[]
}

export type StudySessionInput = {
  session_type: 'quiz' | 'flashcard' | 'exam'
  level: string | null
  score: number
  total: number
  duration_sec: number
  detail: Record<string, unknown>
}

const VALID_SESSION_TYPES = ['quiz', 'flashcard', 'exam'] as const
const VALID_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

export async function saveStudySession(
  input: StudySessionInput
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_SESSION_TYPES.includes(input.session_type as typeof VALID_SESSION_TYPES[number])) {
    return { success: false, error: 'invalid_session_type' }
  }
  if (input.level !== null && !VALID_LEVELS.includes(input.level)) {
    return { success: false, error: 'invalid_level' }
  }
  if (typeof input.total !== 'number' || input.total < 0 || input.total > 100) {
    return { success: false, error: 'invalid_total' }
  }
  if (typeof input.score !== 'number' || input.score < 0 || input.score > input.total) {
    return { success: false, error: 'invalid_score' }
  }
  if (typeof input.duration_sec !== 'number' || input.duration_sec < 0 || input.duration_sec > 86400) {
    return { success: false, error: 'invalid_duration' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { error } = await supabase.from('jp_study_sessions').insert({
    user_id: user.id,
    session_type: input.session_type,
    level: input.level,
    score: input.score,
    total: input.total,
    duration_sec: input.duration_sec,
    detail: input.detail,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}
