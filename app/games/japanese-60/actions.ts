'use server'

import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/japanese/rateLimit'
import { generateQuestions, toClientQuestion, type ClientQuestion, type ServerQuestion } from '@/lib/games/jp60/generate'
import {
  JP60_DAILY_QUESTIONS,
  JP60_DURATION_SEC,
  JP60_PRACTICE_COUNTS,
  JP60_RUSH_MAX_QUESTIONS,
  JP60_SUBMIT_GRACE_MS,
  isJp60Level,
  isJp60Mode,
  type Jp60Level,
  type Jp60Mode,
} from '@/lib/games/jp60/constants'
import { dailySeed } from '@/lib/games/jp60/daily'
import { nextTargetDifficulty, pickByDifficulty } from '@/lib/games/jp60/difficulty'
import { computeTotals, type AnswerRecord } from '@/lib/games/jp60/scoring'
import { computeXp, levelForXp } from '@/lib/games/jp60/xp'
import { applyStreak, nextMilestone } from '@/lib/games/jp60/streak'
import { evaluateAchievements } from '@/lib/games/jp60/achievements'
import { tokyoDateString, tokyoWeeklyPeriod } from '@/lib/games/jp60/time'

// ── config ───────────────────────────────────────────────────────────────────
export type Jp60Settings = {
  enabled: boolean
  modes: Record<Jp60Mode, boolean>
  levels: Record<string, boolean>
  duration_sec: number
  daily_questions: number
}

const DEFAULT_SETTINGS: Jp60Settings = {
  enabled: true,
  modes: { daily: true, rush: true, practice: true },
  levels: { N5: true, N4: true, N3: true, N2: true, N1: true, MIXED: true },
  duration_sec: JP60_DURATION_SEC,
  daily_questions: JP60_DAILY_QUESTIONS,
}

export async function getJp60Settings(): Promise<Jp60Settings> {
  try {
    const supabase = createClient()
    const { data } = await supabase.from('jp60_config').select('value').eq('key', 'settings').maybeSingle()
    if (!data?.value) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(data.value as Partial<Jp60Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ── stored play-state shape (lives in jp60_sessions.questions jsonb) ──────────
type QItem = ServerQuestion & {
  answered: boolean
  selected: string | null
  is_correct: boolean
  response_ms: number | null
}
type PlayState = {
  items: QItem[]
  log: { idx: number; qid: string }[] // answer order (drives combo/score)
  currentQid: string | null
  currentServedAt: string | null
  consecCorrect: number
  consecWrong: number
  lastDifficulty: 'easy' | 'normal' | 'hard'
  recentSourceIds: string[]
}

type StartInput = {
  mode: string
  level: string
  count?: number
  timed?: boolean
  challengeCode?: string | null
}

export type StartResult =
  | { ok: true; sessionId: string; ranked: boolean; timed: boolean; durationSec: number; total: number; question: ClientQuestion; mode: Jp60Mode; level: Jp60Level }
  | { ok: false; error: string }

// ── start a session ───────────────────────────────────────────────────────────
export async function startJp60Session(input: StartInput): Promise<StartResult> {
  if (!isJp60Mode(input.mode)) return { ok: false, error: 'invalid_mode' }
  if (!isJp60Level(input.level)) return { ok: false, error: 'invalid_level' }
  const mode = input.mode
  const level = input.level

  const settings = await getJp60Settings()
  if (!settings.enabled) return { ok: false, error: 'game_disabled' }
  if (!settings.modes[mode]) return { ok: false, error: 'mode_disabled' }
  if (!settings.levels[level]) return { ok: false, error: 'level_disabled' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Rate limit session creation per user / anon.
  const rl = rateLimit(`jp60:start:${user?.id ?? 'anon'}`, 20, 60_000)
  if (!rl.ok) return { ok: false, error: 'rate_limited' }

  const locale = await getLocale()
  const admin = createAdminClient()

  const timed = mode === 'practice' ? input.timed !== false : true
  const today = tokyoDateString()

  // Friend challenge: replay the creator's exact (level, seed, duration) set.
  let challengeId: string | null = null
  let challengeSeed: number | null = null
  let challengeLevel: Jp60Level | null = null
  let challengeDuration: number | null = null
  if (input.challengeCode) {
    const safe = String(input.challengeCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    const { data: ch } = await admin.from('jp60_challenges').select('*').eq('code', safe).maybeSingle()
    if (!ch) return { ok: false, error: 'challenge_not_found' }
    if (Date.now() > new Date(ch.expires_at).getTime()) return { ok: false, error: 'challenge_expired' }
    challengeId = ch.id
    challengeSeed = Number(ch.seed)
    challengeLevel = ch.level as Jp60Level
    challengeDuration = ch.duration_sec
  }

  // Resolve question count + daily seed.
  let count: number
  let seed: number | null = null
  if (challengeId) {
    count = JP60_RUSH_MAX_QUESTIONS
    seed = challengeSeed
  } else if (mode === 'daily') {
    count = settings.daily_questions
    seed = dailySeed(today, level)
  } else if (mode === 'rush') {
    count = JP60_RUSH_MAX_QUESTIONS
  } else {
    const requested = Math.floor(input.count ?? 10)
    count = (JP60_PRACTICE_COUNTS as readonly number[]).includes(requested) ? requested : 10
  }

  // Challenge play uses the challenge's level/duration and is never globally ranked.
  const effLevel = challengeLevel ?? level

  // Ranked: only logged-in users, daily/rush, no challenge, FIRST daily attempt/level.
  let ranked = !!user && !challengeId && (mode === 'daily' || mode === 'rush')
  if (ranked && mode === 'daily') {
    const { data: existing } = await admin
      .from('jp60_daily_participation')
      .select('user_id')
      .eq('user_id', user!.id)
      .eq('daily_date', today)
      .eq('level', effLevel)
      .maybeSingle()
    if (existing) ranked = false // replay allowed but unranked
  }

  // Recent-exposure: for logged-in, non-deterministic sessions, down-weight the
  // source items this user has seen most recently (deterministic daily/challenge
  // sets are intentionally NOT filtered — everyone must get the same questions).
  let excludeSourceIds: Set<string> | undefined
  if (user && seed == null) {
    try {
      const { data: recent } = await admin
        .from('jp60_answers')
        .select('source_type,source_id')
        .eq('user_id', user.id)
        .order('answered_at', { ascending: false })
        .limit(150)
      excludeSourceIds = new Set((recent ?? []).map((r: { source_type: string; source_id: string }) => `${r.source_type}:${r.source_id}`))
    } catch { /* migration may be pending — fall back to no exclusion */ }
  }

  let generated: ServerQuestion[]
  try {
    generated = await generateQuestions(admin, { level: effLevel, count, locale, seed, excludeSourceIds })
  } catch {
    return { ok: false, error: 'generation_failed' }
  }
  if (generated.length === 0) return { ok: false, error: 'no_questions' }

  const items: QItem[] = generated.map((q) => ({ ...q, answered: false, selected: null, is_correct: false, response_ms: null }))
  const first = items[0]
  const nowIso = new Date().toISOString()
  const durationSec = !timed ? 0 : (challengeDuration ?? settings.duration_sec)
  const expiresAt = timed ? new Date(Date.now() + durationSec * 1000 + JP60_SUBMIT_GRACE_MS).toISOString() : null

  const state: PlayState = {
    items,
    log: [],
    currentQid: first.id,
    currentServedAt: nowIso,
    consecCorrect: 0,
    consecWrong: 0,
    lastDifficulty: 'normal',
    recentSourceIds: [first.sourceId],
  }

  const { data: session, error } = await admin
    .from('jp60_sessions')
    .insert({
      user_id: user?.id ?? null,
      mode,
      level: effLevel,
      ranked,
      status: 'active',
      seed: seed ?? null,
      daily_date: mode === 'daily' && !challengeId ? today : null,
      challenge_id: challengeId,
      duration_sec: durationSec,
      timed,
      questions: state,
      current_index: 0,
      started_at: nowIso,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !session) return { ok: false, error: 'start_failed' }

  return {
    ok: true,
    sessionId: session.id,
    ranked,
    timed,
    durationSec,
    total: mode === 'rush' || challengeId ? 0 : items.length, // rush/challenge have no fixed total
    question: toClientQuestion(first, 0),
    mode,
    level: effLevel,
  }
}

// ── submit one answer ──────────────────────────────────────────────────────────
type SubmitInput = { sessionId: string; questionId: string; selectedKey: string | null }
export type SubmitResult =
  | {
      ok: true
      correct: boolean
      correctKey: string
      explanation: string | null
      sourceType: string
      sourceId: string
      qType: string
      answeredIndex: number
      next: ClientQuestion | null
    }
  | { ok: false; error: string }

function chooseNext(state: PlayState, mode: Jp60Mode): QItem | null {
  const unanswered = state.items.filter((q) => !q.answered)
  if (unanswered.length === 0) return null
  if (mode === 'rush') {
    const target = nextTargetDifficulty({ current: state.lastDifficulty, consecutiveCorrect: state.consecCorrect, consecutiveWrong: state.consecWrong })
    const recent = new Set(state.recentSourceIds.slice(-8))
    const pick = pickByDifficulty(
      unanswered.map((q) => ({ difficulty: q.difficulty, sourceId: q.sourceId, ref: q })),
      target,
      recent
    )
    return pick ? (pick as { ref: QItem }).ref : unanswered[0]
  }
  return unanswered[0] // daily / practice: deterministic order
}

export async function submitJp60Answer(input: SubmitInput): Promise<SubmitResult> {
  const admin = createAdminClient()
  const { data: session } = await admin.from('jp60_sessions').select('*').eq('id', input.sessionId).maybeSingle()
  if (!session) return { ok: false, error: 'session_not_found' }
  if (session.status !== 'active') return { ok: false, error: 'session_closed' }

  const state = session.questions as PlayState
  const now = Date.now()

  // Expiry (server-authoritative; grace already baked into expires_at).
  if (session.timed && session.expires_at && now > new Date(session.expires_at).getTime()) {
    await admin.from('jp60_sessions').update({ status: 'expired' }).eq('id', session.id)
    return { ok: false, error: 'session_expired' }
  }

  // Idempotency: a retried submit for an already-answered question replays its result.
  const already = state.items.find((q) => q.id === input.questionId && q.answered)
  if (already) {
    return {
      ok: true,
      correct: already.is_correct,
      correctKey: already.correctKey,
      explanation: already.explanation,
      sourceType: already.sourceType,
      sourceId: already.sourceId,
      qType: already.qType,
      answeredIndex: state.log.findIndex((l) => l.qid === already.id),
      next: state.currentQid ? clientFor(state, state.currentQid) : null,
    }
  }

  // The submitted question must be the one currently served (prevents replay/skip).
  if (state.currentQid !== input.questionId) return { ok: false, error: 'out_of_sync' }
  const cur = state.items.find((q) => q.id === input.questionId)
  if (!cur) return { ok: false, error: 'bad_question' }

  // Server-side response time; flag impossible speed but don't reject legit users.
  const servedAt = state.currentServedAt ? new Date(state.currentServedAt).getTime() : now
  let responseMs = Math.max(0, now - servedAt)
  let suspicious = session.suspicious as boolean
  let suspiciousReason = session.suspicious_reason as string | null
  if (input.selectedKey != null && responseMs < 150) {
    suspicious = true
    suspiciousReason = suspiciousReason ?? 'impossible_speed'
  }
  if (session.timed) responseMs = Math.min(responseMs, session.duration_sec * 1000)

  const correct = input.selectedKey != null && input.selectedKey === cur.correctKey

  cur.answered = true
  cur.selected = input.selectedKey
  cur.is_correct = correct
  cur.response_ms = responseMs
  const answeredIndex = state.log.length
  state.log.push({ idx: answeredIndex, qid: cur.id })

  // Update adaptive counters.
  if (input.selectedKey == null) { state.consecCorrect = 0; state.consecWrong = 0 }
  else if (correct) { state.consecCorrect += 1; state.consecWrong = 0 }
  else { state.consecWrong += 1; state.consecCorrect = 0 }
  state.lastDifficulty = cur.difficulty

  // Choose + serve the next question.
  const next = chooseNext(state, session.mode as Jp60Mode)
  if (next) {
    state.currentQid = next.id
    state.currentServedAt = new Date().toISOString()
    state.recentSourceIds.push(next.sourceId)
    if (state.recentSourceIds.length > 30) state.recentSourceIds = state.recentSourceIds.slice(-30)
  } else {
    state.currentQid = null
    state.currentServedAt = null
  }

  await admin
    .from('jp60_sessions')
    .update({ questions: state, current_index: state.log.length, suspicious, suspicious_reason: suspiciousReason })
    .eq('id', session.id)

  return {
    ok: true,
    correct,
    correctKey: cur.correctKey,
    explanation: cur.explanation,
    sourceType: cur.sourceType,
    sourceId: cur.sourceId,
    qType: cur.qType,
    answeredIndex,
    next: next ? toClientQuestion(next, state.log.length) : null,
  }
}

function clientFor(state: PlayState, qid: string): ClientQuestion | null {
  const q = state.items.find((i) => i.id === qid)
  return q ? toClientQuestion(q, state.log.length) : null
}

// ── finish ──────────────────────────────────────────────────────────────────
export type ReviewItem = {
  qType: string
  prompt: string
  promptSub: string | null
  options: { key: string; text: string }[]
  correctKey: string
  selectedKey: string | null
  isCorrect: boolean
  explanation: string | null
  sourceType: string
  sourceId: string
}
export type FinishSummary = {
  ok: true
  persisted: boolean
  ranked: boolean
  mode: Jp60Mode
  level: Jp60Level
  score: number
  accuracy: number
  bestCombo: number
  correct: number
  wrong: number
  skipped: number
  total: number
  avgCorrectMs: number
  xp: number
  xpBreakdown: ReturnType<typeof computeXp> | null
  level_now: number | null
  level_progress: number | null
  isPersonalRecord: boolean
  streakCurrent: number | null
  streakNextMilestone: number | null
  newAchievements: string[]
  review: ReviewItem[]
}
export type FinishResult = FinishSummary | { ok: false; error: string }

export async function finishJp60Session(sessionId: string): Promise<FinishResult> {
  const admin = createAdminClient()
  const { data: session } = await admin.from('jp60_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) return { ok: false, error: 'session_not_found' }

  const state = session.questions as PlayState
  const mode = session.mode as Jp60Mode
  const level = session.level as Jp60Level

  // Build the authoritative answer list (in answer order) → totals.
  const answered = state.log.map((l) => state.items.find((i) => i.id === l.qid)!).filter(Boolean)
  const records: AnswerRecord[] = answered.map((q) => ({
    isCorrect: q.is_correct,
    difficulty: q.difficulty,
    responseMs: q.response_ms ?? 0,
    selected: q.selected,
  }))
  const totals = computeTotals(records)
  const review = buildReview(state)

  // Idempotent finish: if already completed, just rebuild the summary (no re-award).
  const alreadyDone = session.status === 'completed'

  if (!alreadyDone) {
    await admin.from('jp60_sessions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      score: totals.score,
      accuracy: totals.accuracy,
      best_combo: totals.bestCombo,
      correct_count: totals.correct,
      wrong_count: totals.wrong,
      skipped_count: totals.skipped,
      avg_correct_ms: totals.avgCorrectMs,
    }).eq('id', sessionId)
  }

  const userId = session.user_id as string | null
  const ranked = (session.ranked as boolean) && !(session.suspicious as boolean)

  // Guests / unsaved replays: return the summary without persistence.
  if (!userId) {
    return summary({ persisted: false, ranked: false, mode, level, totals, review, xp: 0, xpBreakdown: null, level_now: null, level_progress: null, isPersonalRecord: false, streakCurrent: null, streakNextMilestone: null, newAchievements: [] })
  }

  // If already persisted, recompute the user-facing numbers from stored stats.
  if (alreadyDone) {
    const { data: stats } = await admin.from('jp60_player_stats').select('total_xp,streak_current').eq('user_id', userId).maybeSingle()
    const lp = stats ? levelForXp(stats.total_xp) : null
    return summary({ persisted: true, ranked, mode, level, totals, review, xp: 0, xpBreakdown: null, level_now: lp?.level ?? null, level_progress: lp?.progress ?? null, isPersonalRecord: false, streakCurrent: stats?.streak_current ?? null, streakNextMilestone: stats ? nextMilestone(stats.streak_current) : null, newAchievements: [] })
  }

  try {
    return await persistAndScore({ admin, userId, session, mode, level, totals, review, state })
  } catch {
    // Migration not applied / transient DB error → still show the result.
    return summary({ persisted: false, ranked: false, mode, level, totals, review, xp: 0, xpBreakdown: null, level_now: null, level_progress: null, isPersonalRecord: false, streakCurrent: null, streakNextMilestone: null, newAchievements: [] })
  }
}

function buildReview(state: PlayState): ReviewItem[] {
  return state.log.map((l) => {
    const q = state.items.find((i) => i.id === l.qid)!
    return {
      qType: q.qType,
      prompt: q.prompt,
      promptSub: q.promptSub,
      options: q.options,
      correctKey: q.correctKey,
      selectedKey: q.selected,
      isCorrect: q.is_correct,
      explanation: q.explanation,
      sourceType: q.sourceType,
      sourceId: q.sourceId,
    }
  })
}

type PersistArgs = {
  admin: ReturnType<typeof createAdminClient>
  userId: string
  session: any
  mode: Jp60Mode
  level: Jp60Level
  totals: ReturnType<typeof computeTotals>
  review: ReviewItem[]
  state: PlayState
}

async function persistAndScore(a: PersistArgs): Promise<FinishSummary> {
  const { admin, userId, session, mode, level, totals, review, state } = a
  const today = tokyoDateString()
  const week = tokyoWeeklyPeriod()
  const ranked = (session.ranked as boolean) && !(session.suspicious as boolean)

  // Category correct counts for this session.
  let vocabC = 0, kanjiC = 0, grammarC = 0
  for (const q of state.items) {
    if (!q.answered || !q.is_correct) continue
    if (q.sourceType === 'vocabulary') vocabC++
    else if (q.sourceType === 'kanji') kanjiC++
    else if (q.sourceType === 'grammar') grammarC++
  }

  // ── audit answer rows ──
  const answerRows = state.log.map((l, i) => {
    const q = state.items.find((it) => it.id === l.qid)!
    return {
      session_id: session.id,
      user_id: userId,
      idx: i,
      source_type: q.sourceType,
      source_id: q.sourceId,
      q_type: q.qType,
      question_text: q.prompt.slice(0, 500),
      correct_answer: (q.options.find((o) => o.key === q.correctKey)?.text ?? '').slice(0, 300),
      selected_answer: q.selected == null ? null : (q.options.find((o) => o.key === q.selected)?.text ?? '').slice(0, 300),
      is_correct: q.is_correct,
      difficulty: q.difficulty,
      response_ms: q.response_ms,
    }
  })
  if (answerRows.length) await admin.from('jp60_answers').insert(answerRows)

  // ── load + update player stats ──
  const { data: prev } = await admin.from('jp60_player_stats').select('*').eq('user_id', userId).maybeSingle()
  const base = prev ?? {
    total_games: 0, total_questions: 0, total_correct: 0, vocab_correct: 0, kanji_correct: 0,
    grammar_correct: 0, best_combo: 0, best_score: 0, total_xp: 0, streak_current: 0,
    streak_longest: 0, streak_last_date: null, sum_correct_ms: 0,
  }

  // ── streak (Asia/Tokyo) ──
  const streak = applyStreak(
    { current: base.streak_current, longest: base.streak_longest, lastActiveDate: base.streak_last_date },
    today
  )

  // ── personal record (per mode+level) ──
  const { data: rec } = await admin
    .from('jp60_personal_records')
    .select('best_score')
    .eq('user_id', userId).eq('mode', mode).eq('level', level)
    .maybeSingle()
  const isPersonalRecord = totals.score > (rec?.best_score ?? -1) && totals.correct > 0
  if (isPersonalRecord) {
    await admin.from('jp60_personal_records').upsert({
      user_id: userId, mode, level,
      best_score: totals.score, best_accuracy: totals.accuracy, best_combo: totals.bestCombo,
      achieved_at: new Date().toISOString(),
    }, { onConflict: 'user_id,mode,level' })
  }

  // ── daily participation (one ranked attempt / day / level) ──
  let isFirstDailyToday = false
  if (mode === 'daily') {
    const { data: part } = await admin
      .from('jp60_daily_participation')
      .select('user_id')
      .eq('user_id', userId).eq('daily_date', today).eq('level', level)
      .maybeSingle()
    if (!part) {
      isFirstDailyToday = true
      await admin.from('jp60_daily_participation').insert({
        user_id: userId, daily_date: today, level,
        first_session_id: session.id,
        ranked_score: ranked ? totals.score : null,
        ranked_accuracy: ranked ? totals.accuracy : null,
        attempts: 1,
      })
    }
    // Replays after the first attempt stay unranked; we don't bump a counter here
    // to keep the write idempotent under network retries.
  }

  // ── new lifetime aggregates ──
  const newStats = {
    user_id: userId,
    total_games: base.total_games + 1,
    total_questions: base.total_questions + totals.correct + totals.wrong,
    total_correct: base.total_correct + totals.correct,
    vocab_correct: base.vocab_correct + vocabC,
    kanji_correct: base.kanji_correct + kanjiC,
    grammar_correct: base.grammar_correct + grammarC,
    best_combo: Math.max(base.best_combo, totals.bestCombo),
    best_score: Math.max(base.best_score, totals.score),
    streak_current: streak.current,
    streak_longest: streak.longest,
    streak_last_date: streak.lastActiveDate,
    sum_correct_ms: Number(base.sum_correct_ms) + totals.avgCorrectMs * totals.correct,
    updated_at: new Date().toISOString(),
  }

  // ── achievements (evaluate against post-session aggregates) ──
  const { data: ownedRows } = await admin.from('jp60_user_achievements').select('code').eq('user_id', userId)
  const owned = new Set((ownedRows ?? []).map((r: { code: string }) => r.code))
  const satisfied = evaluateAchievements({
    totalGames: newStats.total_games,
    totalQuestions: newStats.total_questions,
    bestScoreEver: newStats.best_score,
    bestComboEver: newStats.best_combo,
    streakCurrent: streak.current,
    vocabCorrect: newStats.vocab_correct,
    kanjiCorrect: newStats.kanji_correct,
    grammarCorrect: newStats.grammar_correct,
    sessionLevel: level,
    sessionPerfect: totals.correct > 0 && totals.wrong === 0 && totals.skipped === 0,
    dailyWinnerFinalized: false, // awarded by a separate finalize job, never here
    friendChallengeCreated: false,
    friendChallengeWon: false,
  })
  const newAchievements = satisfied.filter((c) => !owned.has(c))

  // ── XP ──
  const xp = computeXp({
    totals,
    isFirstDailyToday,
    isPersonalRecord,
    streakMilestoneHit: streak.milestoneHit != null,
    achievementsUnlocked: newAchievements.length,
  })
  const totalXp = base.total_xp + xp.total
  await admin.from('jp60_player_stats').upsert({ ...newStats, total_xp: totalXp }, { onConflict: 'user_id' })

  if (newAchievements.length) {
    await admin.from('jp60_user_achievements').insert(
      newAchievements.map((code) => ({ user_id: userId, code, session_id: session.id }))
    )
  }

  // ── result row (leaderboard source) ──
  await admin.from('jp60_results').upsert({
    session_id: session.id,
    user_id: userId,
    mode, level, ranked,
    score: totals.score,
    accuracy: totals.accuracy,
    best_combo: totals.bestCombo,
    correct_count: totals.correct,
    wrong_count: totals.wrong,
    total_questions: totals.total,
    avg_correct_ms: totals.avgCorrectMs,
    duration_sec: session.duration_sec,
    daily_date: mode === 'daily' ? today : null,
    weekly_key: week.key,
    suspicious: session.suspicious,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'session_id' })
  await admin.from('jp60_sessions').update({ xp_awarded: xp.total }).eq('id', session.id)

  // ── friend challenge participation (records this player's score) ──
  if (session.challenge_id) {
    const { data: ch } = await admin.from('jp60_challenges').select('creator_id,status').eq('id', session.challenge_id).maybeSingle()
    if (ch) {
      const role = ch.creator_id === userId ? 'creator' : 'opponent'
      await admin.from('jp60_challenge_participants').upsert({
        challenge_id: session.challenge_id,
        user_id: userId,
        role,
        session_id: session.id,
        score: totals.score,
        accuracy: totals.accuracy,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'challenge_id,user_id' })
      // Mark complete once both creator and an opponent have played.
      const { count } = await admin.from('jp60_challenge_participants').select('user_id', { count: 'exact', head: true }).eq('challenge_id', session.challenge_id)
      if ((count ?? 0) >= 2 && ch.status === 'open') {
        await admin.from('jp60_challenges').update({ status: 'complete' }).eq('id', session.challenge_id)
      }
    }
  }

  const lp = levelForXp(totalXp)
  return summary({
    persisted: true, ranked, mode, level, totals, review,
    xp: xp.total, xpBreakdown: xp,
    level_now: lp.level, level_progress: lp.progress,
    isPersonalRecord,
    streakCurrent: streak.current,
    streakNextMilestone: nextMilestone(streak.current),
    newAchievements,
  })
}

function summary(p: {
  persisted: boolean; ranked: boolean; mode: Jp60Mode; level: Jp60Level
  totals: ReturnType<typeof computeTotals>; review: ReviewItem[]
  xp: number; xpBreakdown: ReturnType<typeof computeXp> | null
  level_now: number | null; level_progress: number | null
  isPersonalRecord: boolean; streakCurrent: number | null; streakNextMilestone: number | null
  newAchievements: string[]
}): FinishSummary {
  return {
    ok: true,
    persisted: p.persisted,
    ranked: p.ranked,
    mode: p.mode,
    level: p.level,
    score: p.totals.score,
    accuracy: p.totals.accuracy,
    bestCombo: p.totals.bestCombo,
    correct: p.totals.correct,
    wrong: p.totals.wrong,
    skipped: p.totals.skipped,
    total: p.totals.total,
    avgCorrectMs: p.totals.avgCorrectMs,
    xp: p.xp,
    xpBreakdown: p.xpBreakdown,
    level_now: p.level_now,
    level_progress: p.level_progress,
    isPersonalRecord: p.isPersonalRecord,
    streakCurrent: p.streakCurrent,
    streakNextMilestone: p.streakNextMilestone,
    newAchievements: p.newAchievements,
    review: p.review,
  }
}
