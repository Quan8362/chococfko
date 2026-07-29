// Shared SEO constants and JSON-LD helpers for public landing pages.
// Japanese-specific helpers live in `@/lib/japanese/seo`; this module covers
// the site-wide bits plus Community and Places structured data.

export const SITE_URL = 'https://chococfko.com'
export const SITE_NAME = 'Chợ Cóc FKO'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

/** Map of next-intl locale → Open Graph locale tag. */
export const OG_LOCALE: Record<string, string> = {
  vi: 'vi_VN', en: 'en_US', ja: 'ja_JP', ko: 'ko_KR', zh: 'zh_CN',
}

/** Resolve a path or absolute URL to an absolute production URL. */
export function absUrl(path: string): string {
  if (!path) return SITE_URL
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Organization publisher node reused across Article/BlogPosting JSON-LD. */
export const PUBLISHER_JSONLD = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo-nav.png` },
}

/** Build a BreadcrumbList node from {name, path} steps. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  }
}

/**
 * Serialize a JSON-LD object for a <script type="application/ld+json"> tag.
 * `JSON.stringify` drops object keys whose value is `undefined`, so callers can
 * leave optional fields inline without emitting invalid `null`/`undefined` data
 * (just avoid putting `undefined` inside arrays).
 *
 * The `<`, `>`, `&` and the U+2028/U+2029 line separators are re-encoded as `\uXXXX`
 * so an admin-authored value (e.g. a tournament name containing `</script>`) can never
 * break out of the script tag. Browsers decode the escapes back, so the structured data
 * is byte-for-byte equivalent — the escaping is purely an XSS guard.
 */
export function jsonLdString(obj: unknown): string {
  return JSON.stringify(obj).replace(/[<>&\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}
