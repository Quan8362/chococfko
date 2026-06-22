'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareRank } from '@/lib/games/jp60/scoring'
import { levelForXp } from '@/lib/games/jp60/xp'
import { tokyoDateString, tokyoWeeklyPeriod } from '@/lib/games/jp60/time'

export type LeaderboardScope = 'today' | 'week' | 'alltime'

export type LeaderboardRow = {
  rank: number
  displayName: string
  avatarUrl: string | null
  level: number
  score: number
  accuracy: number
  isCurrentUser: boolean
}
export type LeaderboardResult = {
  rows: LeaderboardRow[]
  me: LeaderboardRow | null // current user's row even if outside the top page
}

type ResultRow = {
  user_id: string
  score: number
  accuracy: number
  avg_correct_ms: number
  completed_at: string
}

function tokyoDayRangeUtc(): { start: string; end: string } {
  const ymd = tokyoDateString()
  const start = new Date(`${ymd}T00:00:00+09:00`).toISOString()
  const end = new Date(new Date(`${ymd}T00:00:00+09:00`).getTime() + 86400000).toISOString()
  return { start, end }
}

// Best-per-user ranked leaderboard with safe public DTOs (name + avatar only).
export async function getJp60Leaderboard(opts: {
  scope: LeaderboardScope
  mode?: 'daily' | 'rush' | 'all'
  level?: string // specific level or 'all'
  limit?: number
}): Promise<LeaderboardResult> {
  const limit = Math.min(100, Math.max(5, opts.limit ?? 50))
  const admin = createAdminClient()

  // Who is the viewer (anon-safe).
  let myId: string | null = null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    myId = user?.id ?? null
  } catch { /* anon */ }

  let q = admin
    .from('jp60_results')
    .select('user_id,score,accuracy,avg_correct_ms,completed_at')
    .eq('ranked', true)
    .eq('suspicious', false)

  if (opts.mode && opts.mode !== 'all') q = q.eq('mode', opts.mode)
  if (opts.level && opts.level !== 'all') q = q.eq('level', opts.level)

  if (opts.scope === 'today') {
    const { start, end } = tokyoDayRangeUtc()
    q = q.gte('completed_at', start).lt('completed_at', end)
  } else if (opts.scope === 'week') {
    q = q.eq('weekly_key', tokyoWeeklyPeriod().key)
  }

  // Pull a bounded window, dedupe to best-per-user, then rank.
  const { data } = await q
    .order('score', { ascending: false })
    .order('accuracy', { ascending: false })
    .order('avg_correct_ms', { ascending: true })
    .order('completed_at', { ascending: true })
    .limit(500)

  const rows = (data ?? []) as ResultRow[]
  const bestByUser = new Map<string, ResultRow>()
  for (const r of rows) {
    const cur = bestByUser.get(r.user_id)
    if (!cur || compareRank({ ...r, completedAtMs: Date.parse(r.completed_at), avgCorrectMs: r.avg_correct_ms }, { ...cur, completedAtMs: Date.parse(cur.completed_at), avgCorrectMs: cur.avg_correct_ms }) < 0) {
      bestByUser.set(r.user_id, r)
    }
  }
  const ranked = Array.from(bestByUser.values()).sort((a, b) =>
    compareRank(
      { score: a.score, accuracy: a.accuracy, avgCorrectMs: a.avg_correct_ms, completedAtMs: Date.parse(a.completed_at) },
      { score: b.score, accuracy: b.accuracy, avgCorrectMs: b.avg_correct_ms, completedAtMs: Date.parse(b.completed_at) }
    )
  )

  const topIds = ranked.slice(0, limit).map((r) => r.user_id)
  const meIdx = myId ? ranked.findIndex((r) => r.user_id === myId) : -1
  const idsToHydrate = new Set(topIds)
  if (meIdx >= 0) idsToHydrate.add(myId!)
  const ids = Array.from(idsToHydrate)

  const [profilesRes, statsRes] = await Promise.all([
    ids.length ? admin.from('profiles').select('id,display_name,avatar_url').in('id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('jp60_player_stats').select('user_id,total_xp').in('user_id', ids) : Promise.resolve({ data: [] }),
  ])
  const profiles = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const xpByUser = new Map((statsRes.data ?? []).map((s: any) => [s.user_id, s.total_xp as number]))

  const toRow = (r: ResultRow, rank: number): LeaderboardRow => {
    const p = profiles.get(r.user_id)
    return {
      rank,
      displayName: (p?.display_name as string) || 'Player',
      avatarUrl: (p?.avatar_url as string | null) ?? null,
      level: levelForXp(xpByUser.get(r.user_id) ?? 0).level,
      score: r.score,
      accuracy: r.accuracy,
      isCurrentUser: r.user_id === myId,
    }
  }

  const top = ranked.slice(0, limit).map((r, i) => toRow(r, i + 1))
  const me = meIdx >= 0 && meIdx >= limit ? toRow(ranked[meIdx], meIdx + 1) : null
  return { rows: top, me }
}
