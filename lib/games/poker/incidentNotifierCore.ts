// ── Poker SEV-1 active notifier (CORE) — testable, dependency-injected ──────────────────────────
//
// The delivery logic that turns a SEV-1 incident into an alert. Kept free of `import 'server-only'`
// so it is exercisable under `node --test` (see incident.test.ts). The server-only wrapper
// (incidentNotifier.ts) re-exports this and adds the client-import guard; ALL server callers import
// the wrapper, never this file directly.
//
// Closes blocker B1: SEV-1 rollback incidents were detectable but NOT actively observable. Delivery:
//   1. ALWAYS a structured `[poker-sev1]` log line (Vercel runtime log → the channel a log-drain
//      alert rule fires on). Durable and instance-independent.
//   2. BEST-EFFORT an operational email via the SAME Resend path the /feedback pipeline already uses
//      (RESEND_API_KEY, verified sender noreply@chococfko.com) to the server-controlled ADMIN_EMAILS
//      recipients (optionally narrowed by POKER_SEV1_ALERT_EMAIL). No new vendor, no browser send,
//      no hardcoded credentials.
//
// Delivery is BEST-EFFORT and NEVER throws: an alert failure must never corrupt gameplay, settlement
// or the economy. The content is the already-certified-safe Sev1Incident (incident.ts) — it carries
// no cards/seed/deck/tokens/cookies/JWT/email/ip/passwords/SQL/stack traces.

import {
  buildSev1Incident,
  assertSev1Safe,
  SEV1_TITLES,
  type Sev1Code,
  type Sev1Correlation,
  type Sev1Incident,
} from './incident.ts'
import { Sev1Deduper } from './incidentDedup.ts'

function buildVersion(): string | null {
  return process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null
}
function region(): string | null {
  return process.env.VERCEL_REGION ?? null
}

// One process-wide deduper. Serverless instances do not share it — the durable log line is the
// system of record; this only throttles duplicate ALERTS from a single hot instance.
const deduper = new Sev1Deduper()

export interface EmitSev1Input {
  readonly code: Sev1Code
  readonly correlation?: Sev1Correlation
  readonly facts?: Record<string, unknown>
  /** Test seam: inject the clock (ms). Defaults to Date.now(). */
  readonly nowMs?: number
  /** Test seam: inject the fetch used for email (defaults to global fetch). */
  readonly fetchImpl?: typeof fetch
  /** Test seam: inject a deduper (defaults to the process-wide singleton). */
  readonly deduperImpl?: Sev1Deduper
}

export interface EmitSev1Result {
  readonly incident: Sev1Incident
  readonly notified: boolean            // an alert was delivered (log always; email best-effort)
  readonly suppressed: boolean          // deduped within cooldown → no alert this time
  readonly emailDispatched: boolean
  readonly emailReason?: string
}

// The single entry point. build → dedupe → (log + email). Never throws.
export async function emitSev1(input: EmitSev1Input): Promise<EmitSev1Result> {
  const nowMs = input.nowMs ?? Date.now()
  const dd = input.deduperImpl ?? deduper
  // A probe incident to derive the deterministic dedupeKey, then re-stamp with the real count.
  const probe = safeBuild({ code: input.code, correlation: input.correlation, facts: input.facts })
  if (!probe) {
    // Building failed the safety assertion — never emit a possibly-unsafe alert. Log a coded, empty
    // notice so ops still sees SOMETHING happened without any payload.
    logLine({ safe: false, code: input.code })
    return {
      incident: buildSev1Incident({ code: input.code }), // safe: no facts/correlation
      notified: false, suppressed: false, emailDispatched: false, emailReason: 'build_unsafe',
    }
  }

  const decision = dd.record(probe.dedupeKey, nowMs)
  const incident = buildSev1Incident({
    code: input.code,
    correlation: input.correlation,
    facts: input.facts,
    occurrenceCount: decision.occurrenceCount,
  })

  // 1) Durable structured log line — ALWAYS (even when the email is suppressed/unavailable).
  logLine({ safe: true, incident, suppressed: !decision.shouldNotify })

  if (!decision.shouldNotify) {
    return { incident, notified: false, suppressed: true, emailDispatched: false, emailReason: 'deduped' }
  }

  // 2) Operational email — best-effort.
  const email = await sendSev1Email(incident, input.fetchImpl)
  return {
    incident, notified: true, suppressed: false,
    emailDispatched: email.sent, emailReason: email.reason,
  }
}

// ── Structured log — greppable `[poker-sev1]`, redacted by construction ─────────────────────────
function logLine(arg:
  | { safe: true; incident: Sev1Incident; suppressed: boolean }
  | { safe: false; code: Sev1Code }
): void {
  try {
    const payload = arg.safe
      ? {
          source: 'sev1', ts: arg.incident.ts, suppressed: arg.suppressed,
          code: arg.incident.code, severity: arg.incident.severity,
          occurrenceCount: arg.incident.occurrenceCount,
          correlation: arg.incident.correlation, facts: arg.incident.facts,
          buildVersion: buildVersion() ?? undefined, region: region() ?? undefined,
        }
      : { source: 'sev1', code: arg.code, severity: 'SEV1', build_unsafe: true, buildVersion: buildVersion() ?? undefined }
    // eslint-disable-next-line no-console
    console.error(`[poker-sev1] ${JSON.stringify(payload)}`)
  } catch { /* logging is best-effort */ }
}

// Recipients: server-controlled only. POKER_SEV1_ALERT_EMAIL overrides; else ADMIN_EMAILS.
export function sev1AlertRecipients(): string[] {
  const raw = process.env.POKER_SEV1_ALERT_EMAIL || process.env.ADMIN_EMAILS || ''
  return raw.split(',').map((e) => e.trim()).filter(Boolean)
}

// The kill-switch + investigation guidance carried in every alert body (no secrets).
const GUIDANCE = [
  'Kill switch: set POKER_ENABLED=false to disable all poker, or POKER_TOURNAMENT_INTERNAL_ALPHA=(empty) to close tournaments.',
  'Investigate: /admin/poker/observability and the [poker-sev1]/[poker-alert] runtime logs (grep by code + correlation ids).',
  'Runbook: docs/poker/operations/sev1-incidents-runbook.md.',
].join('\n')

// Build the plain-text email body for an incident (pure — exported for tests).
export function buildSev1EmailText(incident: Sev1Incident): string {
  const corr = Object.entries(incident.correlation).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'
  return (
    `SEVERITY: SEV-1\n` +
    `CODE: ${incident.code}\n` +
    `TIME: ${incident.ts}\n` +
    `OCCURRENCES (this window): ${incident.occurrenceCount}\n` +
    `CORRELATION: ${corr}\n` +
    `BUILD: ${buildVersion() ?? '(unknown)'} REGION: ${region() ?? '(unknown)'}\n\n` +
    `SUMMARY: ${incident.summary}\n\n` +
    `${GUIDANCE}\n`
  )
}

export function buildSev1EmailSubject(incident: Sev1Incident): string {
  return incident.correlation.source === 'healthcheck'
    ? `[SEV-1 HEALTHCHECK] Poker alert path test — not a real incident`
    : `[SEV-1] ${SEV1_TITLES[incident.code]} (${incident.code})`
}

async function sendSev1Email(
  incident: Sev1Incident, fetchImpl?: typeof fetch,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'no_api_key' }
  const to = sev1AlertRecipients()
  if (!to.length) return { sent: false, reason: 'no_recipients' }

  // Re-assert safety at the delivery boundary (defense-in-depth). Never send an unsafe alert.
  try { assertSev1Safe(incident) } catch { return { sent: false, reason: 'unsafe' } }

  const doFetch = fetchImpl ?? fetch
  const from = 'Chợ Cóc FKO Ops <noreply@chococfko.com>'
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: buildSev1EmailSubject(incident), text: buildSev1EmailText(incident) }),
    })
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[poker-sev1] email_failed http_${res.status}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    return { sent: true }
  } catch {
    // eslint-disable-next-line no-console
    console.error('[poker-sev1] email_exception')
    return { sent: false, reason: 'exception' }
  }
}

// ── Health check — a disposable, non-incident SEV-1-shaped alert on demand ──────────────────────
// Proves the WHOLE path (build → dedupe → log → email) reaches an approved operator without a REAL
// production incident. Marked with source:'healthcheck' → a distinct subject and never a real breach.
export async function sendSev1HealthCheck(opts?: { nowMs?: number; fetchImpl?: typeof fetch; deduperImpl?: Sev1Deduper }): Promise<EmitSev1Result> {
  return emitSev1({
    code: 'PKR_SEV1_CONTRADICTORY_SETTLEMENT',
    correlation: { source: 'healthcheck' },
    facts: { healthcheck: 1 },
    nowMs: opts?.nowMs,
    fetchImpl: opts?.fetchImpl,
    deduperImpl: opts?.deduperImpl,
  })
}

function safeBuild(input: { code: Sev1Code; correlation?: Sev1Correlation; facts?: Record<string, unknown> }): Sev1Incident | null {
  try { return buildSev1Incident(input) } catch { return null }
}
