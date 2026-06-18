// Best-effort in-memory fixed-window rate limiter.
//
// NOTE: state lives in the module scope of a single server instance. On Vercel's
// serverless/edge runtime each instance keeps its own counters, so this is a
// soft guard against accidental bursts / abuse from a single client — not a
// hard global quota. TODO: back this with Supabase or Upstash Redis if a
// durable, cross-instance limit is ever required.

type Bucket = { count: number; reset: number }

const store = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number) {
  // Occasionally drop expired buckets so the map can't grow unbounded.
  if (now - lastSweep < 60_000) return
  lastSweep = now
  store.forEach((b, key) => { if (now > b.reset) store.delete(key) })
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const b = store.get(key)
  if (!b || now > b.reset) {
    store.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.reset - now) / 1000)) }
  }
  b.count += 1
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 }
}

/** Derive a best-effort client identifier from proxy headers. */
export function clientKey(req: Request, scope: string): string {
  const h = req.headers
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  return `${scope}:${ip}`
}
