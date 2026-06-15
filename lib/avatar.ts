// Route external images that corporate firewalls tend to block (Google / Facebook
// avatars, GIPHY GIFs) through our own /api/avatar proxy so they still load.
// Local URLs, data URIs, and already-proxied URLs pass through unchanged.
const BLOCKED_HOSTS = /(googleusercontent\.com|ggpht\.com|fbcdn\.net|fbsbx\.com|graph\.facebook\.com|giphy\.com)/i

// This project's Supabase public storage prefix. Images stored here are rewritten
// to the same-origin /api/img proxy so the raw supabase.co URL is never exposed in
// the DOM/Network tab (deterrent against casual copying — see lib/imageProxy.ts).
const SUPABASE_PUBLIC = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/'

// URL-safe base64 that works in both the browser and Node (server components).
function b64url(s: string): string {
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Rewrite a Supabase public-storage image URL to the opaque same-origin proxy.
// Any other URL (external CDN, relative, data/blob) is returned unchanged, so this
// is safe to call on every image src indiscriminately.
export function imgProxy(url: string | null | undefined): string {
  if (!url) return ''
  if (!SUPABASE_PUBLIC || !url.startsWith(SUPABASE_PUBLIC)) return url
  const path = url.slice(SUPABASE_PUBLIC.length).split('?')[0].split('#')[0]
  if (!path) return url
  // `v` bumps the CDN cache key when image handling changes (e.g. watermark rollout).
  return `/api/img?p=${b64url(path)}&v=1`
}

export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url
  // Our own Supabase-hosted avatars → hide behind the image proxy.
  if (SUPABASE_PUBLIC && url.startsWith(SUPABASE_PUBLIC)) return imgProxy(url)
  if (BLOCKED_HOSTS.test(url)) {
    return `/api/avatar?url=${encodeURIComponent(url)}`
  }
  return url
}

// Rewrite <img src="..."> in stored rich-text/comment HTML so blocked images
// (e.g. GIPHY GIFs) and our own Supabase images are served through a proxy.
// Safe to run on sanitized HTML.
export function proxyHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(
    /(<img\b[^>]*?\ssrc=)(["'])(.*?)\2/gi,
    (_m, pre, quote, url) => `${pre}${quote}${avatarSrc(url)}${quote}`,
  )
}
