'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { levelForXp } from '@/lib/games/jp60/xp'
import { nextMilestone } from '@/lib/games/jp60/streak'

export type Jp60Stats = {
  signedIn: boolean
  totalGames: number
  totalQuestions: number
  totalCorrect: number
  accuracy: number
  bestScore: number
  bestCombo: number
  level: number
  totalXp: number
  xpIntoLevel: number
  xpForNextLevel: number
  progress: number
  streakCurrent: number
  streakLongest: number
  streakNextMilestone: number | null
  categoryAccuracy: { vocabulary: number; kanji: number; grammar: number }
  unlockedAchievements: { code: string; unlockedAt: string }[]
  recent: { mode: string; level: string; score: number; accuracy: number; completedAt: string }[]
  records: { mode: string; level: string; bestScore: number; bestAccuracy: number; bestCombo: number }[]
  weakItems: { sourceType: string; sourceId: string; questionText: string; wrong: number }[]
}

const EMPTY: Jp60Stats = {
  signedIn: false, totalGames: 0, totalQuestions: 0, totalCorrect: 0, accuracy: 0, bestScore: 0,
  bestCombo: 0, level: 1, totalXp: 0, xpIntoLevel: 0, xpForNextLevel: 100, progress: 0,
  streakCurrent: 0, streakLongest: 0, streakNextMilestone: 3,
  categoryAccuracy: { vocabulary: 0, kanji: 0, grammar: 0 },
  unlockedAchievements: [], recent: [], records: [], weakItems: [],
}

export async function getJp60Stats(): Promise<Jp60Stats> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY

  const admin = createAdminClient()
  const [statsRes, achRes, recentRes, recordsRes, answersRes] = await Promise.all([
    admin.from('jp60_player_stats').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('jp60_user_achievements').select('code,unlocked_at').eq('user_id', user.id).order('unlocked_at', { ascending: false }),
    admin.from('jp60_results').select('mode,level,score,accuracy,completed_at').eq('user_id', user.id).order('completed_at', { ascending: false }).limit(10),
    admin.from('jp60_personal_records').select('mode,level,best_score,best_accuracy,best_combo').eq('user_id', user.id),
    admin.from('jp60_answers').select('source_type,source_id,question_text,is_correct').eq('user_id', user.id).order('answered_at', { ascending: false }).limit(500),
  ])

  const s = statsRes.data
  const lp = levelForXp(s?.total_xp ?? 0)

  // Category accuracy + weak items from the recent answer window.
  const cat: Record<string, { c: number; t: number }> = { vocabulary: { c: 0, t: 0 }, kanji: { c: 0, t: 0 }, grammar: { c: 0, t: 0 } }
  const weak = new Map<string, { sourceType: string; sourceId: string; questionText: string; wrong: number }>()
  for (const a of (answersRes.data ?? []) as any[]) {
    const k = a.source_type as string
    if (cat[k]) { cat[k].t++; if (a.is_correct) cat[k].c++ }
    if (!a.is_correct && a.source_id) {
      const key = `${a.source_type}:${a.source_id}`
      const e = weak.get(key) ?? { sourceType: a.source_type, sourceId: a.source_id, questionText: a.question_text ?? '', wrong: 0 }
      e.wrong++
      weak.set(key, e)
    }
  }
  const pct = (x: { c: number; t: number }) => (x.t === 0 ? 0 : Math.round((x.c / x.t) * 100))

  return {
    signedIn: true,
    totalGames: s?.total_games ?? 0,
    totalQuestions: s?.total_questions ?? 0,
    totalCorrect: s?.total_correct ?? 0,
    accuracy: s && s.total_questions > 0 ? Math.round((s.total_correct / s.total_questions) * 100) : 0,
    bestScore: s?.best_score ?? 0,
    bestCombo: s?.best_combo ?? 0,
    level: lp.level,
    totalXp: s?.total_xp ?? 0,
    xpIntoLevel: lp.xpIntoLevel,
    xpForNextLevel: lp.xpForNextLevel,
    progress: lp.progress,
    streakCurrent: s?.streak_current ?? 0,
    streakLongest: s?.streak_longest ?? 0,
    streakNextMilestone: nextMilestone(s?.streak_current ?? 0),
    categoryAccuracy: { vocabulary: pct(cat.vocabulary), kanji: pct(cat.kanji), grammar: pct(cat.grammar) },
    unlockedAchievements: (achRes.data ?? []).map((a: any) => ({ code: a.code, unlockedAt: a.unlocked_at })),
    recent: (recentRes.data ?? []).map((r: any) => ({ mode: r.mode, level: r.level, score: r.score, accuracy: r.accuracy, completedAt: r.completed_at })),
    records: (recordsRes.data ?? []).map((r: any) => ({ mode: r.mode, level: r.level, bestScore: r.best_score, bestAccuracy: r.best_accuracy, bestCombo: r.best_combo })),
    weakItems: Array.from(weak.values()).sort((a, b) => b.wrong - a.wrong).slice(0, 12),
  }
}
