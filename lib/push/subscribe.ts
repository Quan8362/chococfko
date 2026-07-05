import { savePushSubscription } from './actions'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Ensure this browser has a valid push subscription saved server-side. Registers
// the service worker if needed. Pass forceFresh=true to drop any existing
// subscription and create a brand-new one (used to recover from an expired/410
// subscription, e.g. after the SW was unregistered). No-ops if push isn't
// supported, permission isn't granted, or VAPID public key isn't configured.
export async function subscribeToPush(forceFresh = false): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false

    // Make sure a service worker is registered, then wait for it to be active.
    let reg = await navigator.serviceWorker.getRegistration('/')
    // `updateViaCache: 'none'` keeps the worker script out of the HTTP cache so update checks always
    // hit the network and a new deploy's worker is picked up (matches MentionNotificationProvider).
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    reg = await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (sub && forceFresh) {
      await sub.unsubscribe().catch(() => {})
      sub = null
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      })
    }

    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

    await savePushSubscription({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    })
    return true
  } catch {
    return false
  }
}
