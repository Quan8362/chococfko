'use server'

import { createClient } from '@/lib/supabase/server'

export type ItemType = 'word' | 'kanji' | 'grammar'

export type BookmarkItem = {
  bmId: string
  itemId: string
  itemType: ItemType
  createdAt: string
  label: string
  subLabel?: string
  jlptLevel?: string
}

export type ReviewItem = {
  id: string
  wordId: string
  word: string
  reading?: string
  jlptLevel?: string
  status: 'learning' | 'review'
  nextReview?: string
}

export type StudySessionRecord = {
  id: string
  sessionType: string
  level: string
  score: number
  total: number
  durationSec: number
  createdAt: string
}

export async function toggleBookmark(
  itemId: string,
  itemType: ItemType
): Promise<{ success: boolean; isBookmarked: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, isBookmarked: false, error: 'not_logged_in' }

  const { data: existing } = await supabase
    .from('jp_bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('item_id', itemId)
    .eq('item_type', itemType)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('jp_bookmarks').delete().eq('id', existing.id).eq('user_id', user.id)
    if (error) return { success: false, isBookmarked: true, error: error.message }
    return { success: true, isBookmarked: false }
  }

  const { error } = await supabase
    .from('jp_bookmarks')
    .insert({ user_id: user.id, item_id: itemId, item_type: itemType })
  if (error) return { success: false, isBookmarked: false, error: error.message }
  return { success: true, isBookmarked: true }
}

export async function getBookmarkIds(itemType: ItemType): Promise<string[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('jp_bookmarks')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .limit(500)

  return data?.map(b => b.item_id) ?? []
}

export async function getAllBookmarks(): Promise<BookmarkItem[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: allBms } = await supabase
    .from('jp_bookmarks')
    .select('id, item_id, item_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!allBms?.length) return []

  const wordIds = allBms.filter(b => b.item_type === 'word').map(b => b.item_id)
  const kanjiIds = allBms.filter(b => b.item_type === 'kanji').map(b => b.item_id)
  const grammarIds = allBms.filter(b => b.item_type === 'grammar').map(b => b.item_id)

  const [words, kanjis, grammars] = await Promise.all([
    wordIds.length
      ? supabase.from('japanese_words').select('id,word,reading,jlpt_level').in('id', wordIds)
      : Promise.resolve({ data: [] as { id: string; word: string; reading: string; jlpt_level: string }[] }),
    kanjiIds.length
      ? supabase.from('japanese_kanji').select('id,character,jlpt_level').in('id', kanjiIds)
      : Promise.resolve({ data: [] as { id: string; character: string; jlpt_level: string }[] }),
    grammarIds.length
      ? supabase.from('japanese_grammar').select('id,pattern,jlpt_level').in('id', grammarIds)
      : Promise.resolve({ data: [] as { id: string; pattern: string; jlpt_level: string }[] }),
  ])

  return allBms.map(b => {
    if (b.item_type === 'word') {
      const w = (words.data ?? []).find(x => x.id === b.item_id)
      return {
        bmId: b.id, itemId: b.item_id, itemType: 'word' as ItemType,
        createdAt: b.created_at, label: w?.word ?? '?',
        subLabel: w?.reading ?? undefined, jlptLevel: w?.jlpt_level ?? undefined,
      }
    }
    if (b.item_type === 'kanji') {
      const k = (kanjis.data ?? []).find(x => x.id === b.item_id)
      return {
        bmId: b.id, itemId: b.item_id, itemType: 'kanji' as ItemType,
        createdAt: b.created_at, label: k?.character ?? '?',
        jlptLevel: k?.jlpt_level ?? undefined,
      }
    }
    const g = (grammars.data ?? []).find(x => x.id === b.item_id)
    return {
      bmId: b.id, itemId: b.item_id, itemType: 'grammar' as ItemType,
      createdAt: b.created_at, label: g?.pattern ?? '?',
      jlptLevel: g?.jlpt_level ?? undefined,
    }
  })
}

export async function getStudySessions(limit = 20): Promise<StudySessionRecord[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('jp_study_sessions')
    .select('id, session_type, level, score, total, duration_sec, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(s => ({
    id: s.id,
    sessionType: s.session_type,
    level: s.level,
    score: s.score,
    total: s.total,
    durationSec: s.duration_sec,
    createdAt: s.created_at,
  }))
}

export async function getReviewItems(): Promise<ReviewItem[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: progress } = await supabase
    .from('jp_flashcard_progress')
    .select('id, word_id, status, next_review')
    .eq('user_id', user.id)
    .in('status', ['review', 'learning'])
    .order('next_review', { ascending: true, nullsFirst: false })
    .limit(20)

  if (!progress?.length) return []

  const wordIds = progress.map(p => p.word_id)
  const { data: words } = await supabase
    .from('japanese_words')
    .select('id, word, reading, jlpt_level')
    .in('id', wordIds)

  return progress.map(p => {
    const w = words?.find(x => x.id === p.word_id)
    return {
      id: p.id,
      wordId: p.word_id,
      word: w?.word ?? '?',
      reading: w?.reading ?? undefined,
      jlptLevel: w?.jlpt_level ?? undefined,
      status: p.status as 'learning' | 'review',
      nextReview: p.next_review ?? undefined,
    }
  })
}
