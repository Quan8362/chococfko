'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/japanese/rateLimit'
import { sanitizeUserText } from '@/lib/sanitize'
import { hashSeed } from '@/lib/games/jp60/daily'

const REPORT_REASONS = ['wrong_answer', 'multiple_answers', 'unnatural', 'wrong_reading', 'wrong_furigana', 'wrong_translation', 'typo', 'inappropriate', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

// ── bad-question report ──────────────────────────────────────────────────────
export async function reportJp60Question(input: {
  sessionId: string | null
  sourceType: string
  sourceId: string
  qType: string
  questionText: string
  options: { key: string; text: string }[]
  correctAnswer: string
  reason: string
  note?: string
  locale?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const rl = rateLimit(`jp60:report:${user.id}`, 10, 60_000)
  if (!rl.ok) return { ok: false, error: 'rate_limited' }

  const reason = (REPORT_REASONS as readonly string[]).includes(input.reason) ? input.reason : 'other'
  const { error } = await supabase.from('jp60_question_reports').insert({
    user_id: user.id,
    session_id: input.sessionId,
    source_type: String(input.sourceType).slice(0, 30),
    source_id: String(input.sourceId).slice(0, 64),
    q_type: String(input.qType).slice(0, 60),
    question_text: String(input.questionText).slice(0, 500),
    options: input.options?.slice(0, 6) ?? null,
    correct_answer: String(input.correctAnswer).slice(0, 300),
    reason,
    note: sanitizeUserText(input.note, 500) || null,
    locale: input.locale?.slice(0, 8) ?? null,
  })
  if (error) return { ok: false, error: 'insert_failed' }
  return { ok: true }
}

// ── friend challenge ──────────────────────────────────────────────────────────
function makeCode(): string {
  // Unambiguous alphabet (no 0/O/1/I/L) → 8 chars ≈ 32^8 space; resists enumeration.
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < 8; i++) out += alpha[bytes[i] % alpha.length]
  return out
}

const CHALLENGE_TTL_DAYS = 7

export async function createJp60Challenge(fromSessionId: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const rl = rateLimit(`jp60:challenge:${user.id}`, 15, 60_000)
  if (!rl.ok) return { ok: false, error: 'rate_limited' }

  const admin = createAdminClient()
  const { data: session } = await admin.from('jp60_sessions').select('mode,level,duration_sec,user_id').eq('id', fromSessionId).maybeSingle()
  if (!session || session.user_id !== user.id) return { ok: false, error: 'session_not_found' }

  const code = makeCode()
  const seed = hashSeed(`challenge:${code}:${session.level}`)
  const expires = new Date(Date.now() + CHALLENGE_TTL_DAYS * 86400000).toISOString()

  const { error } = await admin.from('jp60_challenges').insert({
    code,
    creator_id: user.id,
    mode: session.mode === 'daily' ? 'rush' : session.mode, // challenges are replayable rush-style
    level: session.level,
    seed,
    duration_sec: session.duration_sec || 60,
    status: 'open',
    expires_at: expires,
  })
  if (error) return { ok: false, error: 'create_failed' }
  return { ok: true, code }
}

export type ChallengeInfo = {
  code: string
  mode: string
  level: string
  durationSec: number
  status: string
  expired: boolean
  creatorName: string
  participants: { name: string; score: number; accuracy: number; isCreator: boolean }[]
}

export async function getJp60Challenge(code: string): Promise<ChallengeInfo | null> {
  const admin = createAdminClient()
  const safeCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  if (!safeCode) return null

  const { data: ch } = await admin.from('jp60_challenges').select('*').eq('code', safeCode).maybeSingle()
  if (!ch) return null

  const expired = Date.now() > new Date(ch.expires_at).getTime()
  const [creatorRes, partsRes] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', ch.creator_id).maybeSingle(),
    admin.from('jp60_challenge_participants').select('user_id,role,score,accuracy').eq('challenge_id', ch.id),
  ])
  const partIds = (partsRes.data ?? []).map((p: any) => p.user_id).filter(Boolean)
  const profs = partIds.length
    ? (await admin.from('profiles').select('id,display_name').in('id', partIds)).data ?? []
    : []
  const nameOf = new Map(profs.map((p: any) => [p.id, p.display_name]))

  return {
    code: ch.code,
    mode: ch.mode,
    level: ch.level,
    durationSec: ch.duration_sec,
    status: ch.status,
    expired,
    creatorName: (creatorRes.data?.display_name as string) || 'Player',
    participants: (partsRes.data ?? []).map((p: any) => ({
      name: (nameOf.get(p.user_id) as string) || 'Player',
      score: p.score ?? 0,
      accuracy: p.accuracy ?? 0,
      isCreator: p.role === 'creator',
    })),
  }
}
