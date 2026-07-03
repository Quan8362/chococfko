'use server'

// ── Poker SOCIAL — player-facing achievement & mission actions ─────────────────────────────
//
// 'use server' — authoritative reads/commands for the cosmetic social layer. Identity is ALWAYS
// resolved server-side from the session cookie (auth.uid()); the browser never supplies its own
// id and never decides which badge it earned or how far a mission has progressed.
//
// 🔴 ZERO COINS. Nothing here reads or writes a wallet / ledger / stack. Every reward is a
// cosmetic badge or a checklist tick. The write paths go through DEFINER RPCs
// (poker_bump_mission) that clamp at target, so replaying an action farms nothing.
//
// DEGRADE-SAFE. If the achievements migration is not yet applied, reads return empty and writes
// return a coded 'feature_unavailable' the UI translates — deploying code before SQL never breaks.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  POKER_ACHIEVEMENTS,
  isAchievementKey,
  type AchievementKey,
} from '@/lib/games/poker/achievements'
import {
  POKER_MISSIONS,
  isMissionKey,
  missionDef,
  MISSION_PERIOD_ONCE,
  type MissionKey,
} from '@/lib/games/poker/missions'
import { pokerSocialAvailable } from './access'

export type SocialResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// A missing social table (migration not yet applied) must NOT break the page — degrade safely.
function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '42P01'
    || err.code === '42883' // undefined_function (RPC not yet created)
    || /relation .* does not exist|function .* does not exist/i.test(err.message ?? '')
}

// ── Achievements ────────────────────────────────────────────────────────────────────────────
export interface AchievementView {
  key: AchievementKey
  group: string
  i18n: string
  icon: string
  unlocked: boolean
  unlockedAt: number | null
}
export interface AchievementSummary {
  achievements: AchievementView[]
  unlockedCount: number
  totalCount: number
  handsPlayed: number
  showdowns: number
}

export async function fetchMyAchievements(): Promise<SocialResult<AchievementSummary>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (!(await pokerSocialAvailable('achievements'))) return fail('feature_unavailable')

  const unlockedAt = new Map<string, number>()
  const { data: rows, error } = await supabase
    .from('poker_achievements')
    .select('achievement_key, unlocked_at')
  if (error && !isMissingRelation(error)) return fail('load_failed')
  for (const r of rows ?? []) {
    if (isAchievementKey(r.achievement_key)) unlockedAt.set(r.achievement_key, new Date(r.unlocked_at).getTime())
  }

  let handsPlayed = 0
  let showdowns = 0
  const { data: prog, error: progErr } = await supabase
    .from('poker_player_progress')
    .select('hands_played, showdowns')
    .maybeSingle()
  if (progErr && !isMissingRelation(progErr)) return fail('load_failed')
  if (prog) { handsPlayed = Number(prog.hands_played ?? 0); showdowns = Number(prog.showdowns ?? 0) }

  const achievements: AchievementView[] = POKER_ACHIEVEMENTS.map((d) => ({
    key: d.key,
    group: d.group,
    i18n: d.i18n,
    icon: d.icon,
    unlocked: unlockedAt.has(d.key),
    unlockedAt: unlockedAt.get(d.key) ?? null,
  }))
  return {
    ok: true,
    achievements,
    unlockedCount: unlockedAt.size,
    totalCount: POKER_ACHIEVEMENTS.length,
    handsPlayed,
    showdowns,
  }
}

// ── Missions ──────────────────────────────────────────────────────────────────────────────
export interface MissionView {
  key: MissionKey
  i18n: string
  icon: string
  source: string
  progress: number
  target: number
  completed: boolean
}
export interface MissionSummary {
  missions: MissionView[]
  completedCount: number
  totalCount: number
}

export async function fetchMyMissions(): Promise<SocialResult<MissionSummary>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (!(await pokerSocialAvailable('missions'))) return fail('feature_unavailable')

  const rowByKey = new Map<string, { progress: number; completed: boolean }>()
  const { data: rows, error } = await supabase
    .from('poker_missions')
    .select('mission_key, progress, target, completed_at')
    .eq('period_key', MISSION_PERIOD_ONCE)
  if (error && !isMissingRelation(error)) return fail('load_failed')
  for (const r of rows ?? []) {
    if (isMissionKey(r.mission_key)) {
      rowByKey.set(r.mission_key, { progress: Number(r.progress ?? 0), completed: r.completed_at != null })
    }
  }

  const missions: MissionView[] = POKER_MISSIONS.map((d) => {
    const row = rowByKey.get(d.key)
    return {
      key: d.key,
      i18n: d.i18n,
      icon: d.icon,
      source: d.source,
      progress: Math.min(d.target, row?.progress ?? 0),
      target: d.target,
      completed: row?.completed ?? false,
    }
  })
  return {
    ok: true,
    missions,
    completedCount: missions.filter((m) => m.completed).length,
    totalCount: missions.length,
  }
}

// Advance an 'action'-sourced mission (review_rules / complete_training). Idempotent: the DEFINER
// RPC clamps at target, so calling this repeatedly never overshoots or moves coins.
async function bumpActionMission(key: MissionKey): Promise<SocialResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (!(await pokerSocialAvailable('missions'))) return fail('feature_unavailable')
  const def = missionDef(key)
  if (def.source !== 'action') return fail('not_an_action_mission')

  const admin = createAdminClient()
  const { error } = await admin.rpc('poker_bump_mission', {
    p_user_id: user.id,
    p_mission_key: key,
    p_inc: 1,
    p_target: def.target,
  })
  if (error) {
    if (isMissingRelation(error)) return fail('feature_unavailable')
    return fail('mission_failed')
  }
  return { ok: true }
}

export async function markRulesReviewed(): Promise<SocialResult> {
  return bumpActionMission('review_rules')
}

export async function markTrainingScenarioComplete(): Promise<SocialResult> {
  return bumpActionMission('complete_training')
}

// ── Reconnect marker ────────────────────────────────────────────────────────────────────────
// Recorded by the realtime hook when it recovers a dropped channel while the viewer is seated in
// a live hand. It grants nothing by itself; the settlement recorder consults it to award
// `reconnect_finish` to a player who both reconnected AND finished the hand. Self-scoped RLS
// insert (user_id = auth.uid()); idempotent via the (hand_id, user_id) PK.
export async function notePokerReconnect(handId: string): Promise<SocialResult> {
  if (!handId) return fail('bad_request')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (!(await pokerSocialAvailable('achievements'))) return fail('feature_unavailable')

  const { error } = await supabase
    .from('poker_reconnect_events')
    .upsert({ hand_id: handId, user_id: user.id }, { onConflict: 'hand_id,user_id', ignoreDuplicates: true })
  if (error) {
    if (isMissingRelation(error)) return fail('feature_unavailable')
    return fail('reconnect_note_failed')
  }
  return { ok: true }
}
