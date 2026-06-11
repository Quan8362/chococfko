// Route external images that corporate firewalls tend to block (Google / Facebook
// avatars, GIPHY GIFs) through our own /api/avatar proxy so they still load.
// Local URLs, data URIs, and already-proxied URLs pass through unchanged.
const BLOCKED_HOSTS = /(googleusercontent\.com|ggpht\.com|fbcdn\.net|fbsbx\.com|graph\.facebook\.com|giphy\.com)/i

export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (BLOCKED_HOSTS.test(url)) {
    return `/api/avatar?url=${encodeURIComponent(url)}`
  }
  return url
}

// Rewrite <img src="..."> in stored rich-text/comment HTML so blocked images
// (e.g. GIPHY GIFs) are served through the proxy. Safe to run on sanitized HTML.
export function proxyHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(
    /(<img\b[^>]*?\ssrc=)(["'])(.*?)\2/gi,
    (_m, pre, quote, url) => `${pre}${quote}${avatarSrc(url)}${quote}`,
  )
}
