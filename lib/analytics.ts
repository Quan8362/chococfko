import { createClient } from '@/lib/supabase/client'

const VISITOR_KEY = 'chococfko-vid'
const SESSION_KEY = 'chococfko-sid'

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

function getSessionId(): string {
  try {
    const id = sessionStorage.getItem(SESSION_KEY)
    if (id) return id
    const newId = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, newId)
    return newId
  } catch {
    return 'anon-session'
  }
}

// Dedup map: prevent firing the same event+path more than once per 3 seconds
const _recent = new Map<string, number>()

export async function trackEvent(
  eventName: string,
  options?: {
    path?: string
    userId?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  if (typeof window === 'undefined') return

  const path = options?.path ?? window.location.pathname
  const key  = `${eventName}:${path}`
  const now  = Date.now()
  const last = _recent.get(key)
  if (last && now - last < 3000) return
  _recent.set(key, now)

  try {
    const supabase = createClient()
    await supabase.from('analytics_events').insert({
      event_name:           eventName,
      path,
      user_id:              options?.userId ?? null,
      anonymous_visitor_id: getVisitorId(),
      session_id:           getSessionId(),
      locale:               navigator.language ?? null,
      metadata:             options?.metadata ?? null,
    })
  } catch {
    // Never throw — analytics must never crash the app
  }
}
