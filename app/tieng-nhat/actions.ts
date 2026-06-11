'use server'

import { createClient } from '@/lib/supabase/server'

export type ProgressAction = 'correct' | 'review' | 'wrong'
export type ProgressStatus = 'mastered' | 'review' | 'learning'

export async function saveWordProgress(wordId: string, action: ProgressAction) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_authenticated' as const }

  let status: ProgressStatus
  let lastResult: 'correct' | 'wrong'
  let box: number
  let nextReviewDays: number

  switch (action) {
    case 'correct':
      status        = 'mastered'
      lastResult    = 'correct'
      box           = 5
      nextReviewDays = 7
      break
    case 'review':
      status        = 'review'
      lastResult    = 'correct'
      box           = 3
      nextReviewDays = 3
      break
    default:
      status        = 'learning'
      lastResult    = 'wrong'
      box           = 1
      nextReviewDays = 1
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + nextReviewDays)

  const { error } = await supabase
    .from('jp_flashcard_progress')
    .upsert(
      {
        user_id:     user.id,
        word_id:     wordId,
        status,
        last_result: lastResult,
        box,
        next_review: nextReview.toISOString(),
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id,word_id' }
    )

  if (error) return { error: error.message }
  return { success: true as const }
}

export type ProgressMap = Record<string, ProgressStatus>

export async function fetchUserProgress(wordIds: string[]): Promise<ProgressMap> {
  if (wordIds.length === 0) return {}
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const CHUNK = 100
  const map: ProgressMap = {}

  for (let i = 0; i < wordIds.length; i += CHUNK) {
    const chunk = wordIds.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('jp_flashcard_progress')
      .select('word_id, status')
      .eq('user_id', user.id)
      .in('word_id', chunk)
    for (const row of (data ?? [])) {
      map[row.word_id] = row.status as ProgressStatus
    }
  }

  return map
}

/**
 * Fetch the current user's entire flashcard-progress map in one pass.
 * Cheaper than {@link fetchUserProgress} when the caller holds every word of a
 * level (one query per 1000 progress rows instead of one per 100 word ids).
 */
export async function fetchAllUserProgress(): Promise<ProgressMap> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const BATCH = 1000
  const map: ProgressMap = {}

  for (let from = 0; ; from += BATCH) {
    const { data } = await supabase
      .from('jp_flashcard_progress')
      .select('word_id, status')
      .eq('user_id', user.id)
      .range(from, from + BATCH - 1)
    if (!data || data.length === 0) break
    for (const row of data) {
      map[row.word_id] = row.status as ProgressStatus
    }
    if (data.length < BATCH) break
  }

  return map
}
