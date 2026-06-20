'use client'

// Browser glue around the pure helpers in ./clientError.ts. This gathers the
// non-deterministic browser context (online status, build id, user agent) and
// ships a structured report to /api/client-errors. It NEVER throws — every path
// is wrapped — because it runs inside error boundaries where a second throw
// would escalate to the fatal global error page.

import {
  normalizeError,
  buildErrorReport,
  genIncidentId,
  classifyError,
  type ClientErrorReport,
  type ErrorClass,
} from './clientError'

export type ReportContext = {
  route?: string | null
  roomCode?: string | null
  channelStatus?: string | null
  matchStatus?: string | null
  loaded?: { room: boolean; player: boolean; game: boolean } | null
  lastRealtimeEvent?: string | null
}

export function currentBuildId(): string | null {
  // Baked into the client bundle at build time (see next.config.mjs).
  const fromEnv = process.env.NEXT_PUBLIC_BUILD_ID
  if (fromEnv) return fromEnv
  // Fallback: Next embeds a build id in some payloads.
  try {
    const data = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__
    return data?.buildId ?? null
  } catch {
    return null
  }
}

export type ReportResult = { incidentId: string; errorClass: ErrorClass }

/**
 * Build a report from an unknown error + context, log it locally, and POST it to
 * the server (best-effort, keepalive so it survives an imminent reload).
 * Returns the incident id + classification so the caller can decide on recovery.
 */
export function reportClientError(err: unknown, ctx: ReportContext = {}, idPrefix = 'ERR'): ReportResult {
  const normalized = normalizeError(err)
  const errorClass = classifyError(normalized)
  const incidentId = genIncidentId(idPrefix)

  let report: ClientErrorReport
  try {
    report = buildErrorReport({
      err: normalized,
      incidentId,
      route: ctx.route ?? safeLocationPath(),
      roomCode: ctx.roomCode ?? null,
      buildId: currentBuildId(),
      online: safeOnline(),
      channelStatus: ctx.channelStatus ?? null,
      matchStatus: ctx.matchStatus ?? null,
      loaded: ctx.loaded ?? null,
      lastRealtimeEvent: ctx.lastRealtimeEvent ?? null,
      userAgent: safeUserAgent(),
    })
  } catch {
    return { incidentId, errorClass }
  }

  // Local breadcrumb for devs inspecting the console.
  try {
    // eslint-disable-next-line no-console
    console.error(`[client-error ${incidentId}]`, report.errorClass, report.name, report.message)
  } catch { /* ignore */ }

  // Best-effort beacon. keepalive lets it complete even if a reload follows.
  try {
    const body = JSON.stringify(report)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }))
      if (!ok) postFallback(body)
    } else {
      postFallback(body)
    }
  } catch { /* ignore */ }

  return { incidentId, errorClass }
}

function postFallback(body: string): void {
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch { /* ignore */ }
}

function safeLocationPath(): string | null {
  try {
    return window.location.pathname
  } catch {
    return null
  }
}

function safeOnline(): boolean | null {
  try {
    return typeof navigator !== 'undefined' ? navigator.onLine : null
  } catch {
    return null
  }
}

function safeUserAgent(): string | null {
  try {
    return typeof navigator !== 'undefined' ? navigator.userAgent : null
  } catch {
    return null
  }
}
