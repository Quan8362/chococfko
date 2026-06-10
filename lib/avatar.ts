// Route provider avatars (Google / Facebook) through our own /api/avatar proxy so
// they still load on networks that block googleusercontent.com / fbcdn.net.
// Local URLs, data URIs, and already-proxied URLs pass through unchanged.
const BLOCKED_HOSTS = /(googleusercontent\.com|ggpht\.com|fbcdn\.net|fbsbx\.com|graph\.facebook\.com)/i

export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (BLOCKED_HOSTS.test(url)) {
    return `/api/avatar?url=${encodeURIComponent(url)}`
  }
  return url
}
