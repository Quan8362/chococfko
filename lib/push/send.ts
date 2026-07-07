import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { scanText, isSafeInternalPath } from '@/lib/games/poker/notifications/redaction'

export type PushPayload = {
  title: string
  body?: string
  url?: string
  tag?: string
  icon?: string
  // When true, the service worker shows the notification even if a tab is
  // focused (used by the debug test button).
  force?: boolean
}

let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@chococfko.com'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export type PushDiag = {
  configured: boolean
  subs: number
  sent: number
  failed: number
  errors: string[]
}

// Push to a set of users, returning diagnostics. Never throws — push is
// best-effort and must not break the action that triggered it.
export async function sendPushToUsersDiag(userIds: string[], payload: PushPayload): Promise<PushDiag> {
  const result: PushDiag = { configured: false, subs: 0, sent: 0, failed: 0, errors: [] }
  try {
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    if (ids.length === 0) { result.errors.push('no_user_ids'); return result }

    // Defense in depth (27G-H1A): any POKER-tagged push must survive the poker redaction scan before
    // it can reach web-push, even if a caller bypassed the dedicated poker sender. This is the last
    // boundary a private card / seed / token could leak through onto a lock screen. Non-poker
    // payloads (caro/tlmn/admin/comments) are unaffected.
    if (typeof payload.tag === 'string' && payload.tag.startsWith('poker-')) {
      const reasons = [
        ...scanText('title', payload.title ?? ''),
        ...scanText('body', payload.body ?? ''),
        ...scanText('tag', payload.tag ?? ''),
        ...(payload.url != null && !isSafeInternalPath(payload.url) ? ['url: unsafe'] : []),
      ]
      if (reasons.length > 0) { result.errors.push('poker_redaction_blocked'); return result }
    }

    if (!ensureConfigured()) { result.errors.push('vapid_not_configured'); return result }
    result.configured = true

    const admin = createAdminClient()
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', ids)

    if (error) { result.errors.push('db: ' + error.message); return result }
    result.subs = subs?.length ?? 0
    if (!subs || subs.length === 0) return result

    const body = JSON.stringify(payload)
    const deadIds: string[] = []

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
            body,
          )
          result.sent++
        } catch (err: unknown) {
          result.failed++
          const e = err as { statusCode?: number; body?: string; message?: string }
          result.errors.push(`send ${e?.statusCode ?? '?'}: ${(e?.body || e?.message || 'unknown').slice(0, 120)}`)
          // 404/410 = subscription expired or unsubscribed → prune it
          if (e?.statusCode === 404 || e?.statusCode === 410) deadIds.push(s.id as string)
        }
      }),
    )

    if (deadIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', deadIds)
    }
  } catch (err) {
    result.errors.push('fatal: ' + ((err as Error)?.message || String(err)))
  }
  return result
}

// Fire-and-forget wrapper used by the app's event triggers.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await sendPushToUsersDiag(userIds, payload)
}
