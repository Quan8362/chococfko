'use server'

// ── Poker ALPHA server actions — in-game "Report a problem" intake ──────────────
//
// The DB (poker_bug_reports) is the source of truth; a Resend email is a best-effort
// notification after the row is saved (an email failure never loses a report). Mirrors
// the /feedback pipeline. Degrade-safe: if the migration is not yet applied the insert
// fails with a missing-relation error and we return a coded result the UI translates.
//
// 🔴 PRIVACY: the context is re-sanitised HERE with the pure allowlist before anything is
// persisted — the browser is never trusted to have stripped sensitive fields itself.

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkPokerCapability } from './access'
import {
  validateBugReport,
  containsSensitiveKey,
  deviceClassFromViewport,
  type BugSeverity,
  type PokerBugContext,
} from '@/lib/games/poker/bugReport'

export type SubmitBugInput = {
  description: string
  expected?: string
  actual?: string
  severity: BugSeverity
  contactOk: boolean
  screenshotUrl?: string
  context: PokerBugContext
}

export type SubmitBugResult =
  | { ok: true; id: string }
  | { ok: false; error: 'not_authenticated' | 'feature_off' | 'rate_limited' | 'validation' | 'unavailable' | 'db_error' }

// Simple in-memory IP rate limit (best-effort anti-spam), same shape as /feedback.
const RATE_MAX = 8
const RATE_WINDOW_MS = 10 * 60 * 1000
const buckets = new Map<string, number[]>()
function rateLimited(key: string): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) { buckets.set(key, hits); return true }
  hits.push(now); buckets.set(key, hits)
  return false
}

async function notifyOps(row: { id: string; severity: string; description: string; tableId?: string; handId?: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const to = process.env.POKER_ALPHA_REPORT_TO_EMAIL || process.env.FEEDBACK_TO_EMAIL || 'chococfko@gmail.com'
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Chợ Cóc FKO <noreply@chococfko.com>',
        to,
        subject: `[Poker Alpha][${row.severity}] Bug report ${row.id.slice(0, 8)}`,
        text:
          `Severity: ${row.severity}\nReport ID: ${row.id}\n` +
          `Table: ${row.tableId ?? '—'}  Hand: ${row.handId ?? '—'}\n\n${row.description}`,
        html:
          `<p><b>Severity:</b> ${esc(row.severity)}</p>` +
          `<p><b>Table:</b> ${esc(row.tableId ?? '—')} &nbsp; <b>Hand:</b> ${esc(row.handId ?? '—')}</p>` +
          `<hr/><p style="white-space:pre-wrap">${esc(row.description)}</p>`,
      }),
    })
  } catch { /* best-effort */ }
}

export async function submitPokerBugReport(input: SubmitBugInput): Promise<SubmitBugResult> {
  // Only a viewer who can reach the poker feature may file a poker bug report.
  const capErr = await checkPokerCapability('enter')
  if (capErr) return { ok: false, error: 'feature_off' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const ip =
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers().get('x-real-ip') || 'unknown'
  if (rateLimited(`${user.id}:${ip}`)) return { ok: false, error: 'rate_limited' }

  const validated = validateBugReport({
    description: input.description,
    expected: input.expected,
    actual: input.actual,
    severity: input.severity,
    contactOk: input.contactOk,
    screenshotUrl: input.screenshotUrl,
    context: input.context,
  })
  if (!validated.ok) return { ok: false, error: 'validation' }
  const r = validated.report
  const ctx = r.context

  // Defence in depth: refuse to persist if a sanitised context somehow still carries a
  // sensitive-looking key (should be impossible via the allowlist; fail closed if not).
  if (containsSensitiveKey(ctx)) {
    console.error('[poker-bug] sanitised context tripped the sensitive-key guard — refusing to store')
    return { ok: false, error: 'validation' }
  }

  const deviceClass = deviceClassFromViewport(ctx.viewport)
  const clientTs = ctx.timestamp && !Number.isNaN(Date.parse(ctx.timestamp)) ? ctx.timestamp : null

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('poker_bug_reports')
      .insert({
        reporter_id: user.id,
        description: r.description,
        expected_result: r.expected,
        actual_result: r.actual,
        severity: r.severity,
        contact_ok: r.contactOk,
        screenshot_url: r.screenshotUrl,
        table_id: ctx.tableId ?? null,
        hand_id: ctx.handId ?? null,
        seat_index: ctx.seatIndex ?? null,
        street: ctx.street ?? null,
        phase: ctx.phase ?? null,
        state_version: ctx.stateVersion ?? null,
        action_seq: ctx.actionSeq ?? null,
        last_event_id: ctx.lastEventId ?? null,
        player_count: ctx.playerCount ?? null,
        build_version: ctx.buildVersion ?? null,
        browser: ctx.browser ?? null,
        os: ctx.os ?? null,
        viewport: ctx.viewport ?? null,
        orientation: ctx.orientation ?? null,
        locale: ctx.locale ?? null,
        connection_state: ctx.connectionState ?? null,
        reconnect_count: ctx.reconnectCount ?? null,
        error_code: ctx.errorCode ?? null,
        device_class: deviceClass,
        client_path: ctx.path ?? null,
        context: ctx,
        client_ts: clientTs,
      })
      .select('id')
      .single()

    if (error || !data) {
      // 42P01 = undefined_table → migration not applied yet (degrade-safe path).
      const code = (error as { code?: string } | null)?.code
      if (code === '42P01') {
        console.warn('[poker-bug] poker_bug_reports table missing — apply migration_poker_alpha_bug_reports.sql')
        return { ok: false, error: 'unavailable' }
      }
      console.error('[poker-bug] insert failed:', error?.message)
      return { ok: false, error: 'db_error' }
    }

    await notifyOps({ id: data.id, severity: r.severity, description: r.description, tableId: ctx.tableId, handId: ctx.handId })
    return { ok: true, id: data.id }
  } catch (err) {
    console.error('[poker-bug] insert threw:', err)
    return { ok: false, error: 'db_error' }
  }
}
