import { NextResponse } from 'next/server'

// Centralized sink for client-side error reports. Logs a structured line to the
// server console, which Vercel captures as a runtime log — enough to correlate an
// intermittent production crash with deploy times, build ids, and error classes.
//
// Security: we explicitly whitelist a fixed set of non-sensitive fields. We never
// persist or echo tokens, emails, message bodies, or arbitrary client input. The
// stack is truncated to keep log lines bounded.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 16 * 1024
const MAX_STACK = 4000
const MAX_STR = 1000

function str(v: unknown, max = MAX_STR): string | null {
  if (typeof v !== 'string') return null
  return v.length > max ? v.slice(0, max) : v
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: 'too_large' }, { status: 413 })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ ok: false, reason: 'bad_json' }, { status: 400 })
    }

    const loadedRaw = body.loaded as Record<string, unknown> | null | undefined

    const safe = {
      incidentId: str(body.incidentId, 64),
      name: str(body.name, 200),
      message: str(body.message),
      stack: str(body.stack, MAX_STACK),
      digest: str(body.digest, 200),
      errorClass: str(body.errorClass, 32),
      route: str(body.route, 300),
      roomCode: str(body.roomCode, 32),
      buildId: str(body.buildId, 100),
      online: bool(body.online),
      channelStatus: str(body.channelStatus, 64),
      matchStatus: str(body.matchStatus, 32),
      loaded: loadedRaw && typeof loadedRaw === 'object'
        ? { room: bool(loadedRaw.room), player: bool(loadedRaw.player), game: bool(loadedRaw.game) }
        : null,
      lastRealtimeEvent: str(body.lastRealtimeEvent, 32),
      timestamp: str(body.timestamp, 40),
      userAgent: str(body.userAgent, 300),
      serverReceivedAt: new Date().toISOString(),
    }

    // Single structured log line. JSON.stringify keeps it greppable in Vercel logs.
    // eslint-disable-next-line no-console
    console.error('[client-error]', JSON.stringify(safe))

    return NextResponse.json({ ok: true, incidentId: safe.incidentId }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
