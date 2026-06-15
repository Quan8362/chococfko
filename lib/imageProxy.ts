import 'server-only'
import crypto from 'crypto'

// Hides the raw Supabase storage URL of post/place/confession images. Instead of
// exposing `https://<project>.supabase.co/storage/v1/object/public/post-images/x.jpg`
// in the DOM, image `src` is rewritten to `/api/img?t=<token>` where the token is
// an AES-encrypted form of the object path (bucket/file). Viewers see only your own
// domain and an opaque token — they cannot reconstruct the storage URL.
//
// NOTE: this only HIDES the source. It cannot stop someone from downloading the
// rendered bytes (Network tab / screenshot) — no website can. It's a deterrent.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

// Key derived from an existing server-only secret so no new env var is required.
// Falls back to a build-time constant only when the secret is absent (dev), which
// still obfuscates the path from casual inspection.
function getKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chococfko-img-proxy-fallback-key'
  return crypto.createHash('sha256').update(secret).digest()
}

const PUBLIC_PREFIX = '/storage/v1/object/public/'

// Validate a decoded object path. We don't whitelist bucket names (they change as
// features are added, and an over-tight list silently 403s real images). Instead we
// require a plain `bucket/file` shape with only safe characters and no traversal.
// publicUrlForPath only ever appends this to OUR Supabase public prefix, so the
// worst an attacker can do with a forged base64 path is request one of our own
// already-public objects (private buckets aren't reachable via /object/public/).
function isValidObjectPath(path: string): boolean {
  if (!path) return false
  if (path.startsWith('/') || path.includes('..') || path.includes('//')) return false
  if (/[\\:?#]|\s/.test(path)) return false      // no scheme/host tricks, no whitespace
  return /^[^/]+\/.+/.test(path)                  // must be bucket/file
}

// Deterministic IV from the path → same image always yields the same token, so the
// browser/CDN can cache it. The "plaintext" (a non-secret object path) being
// deterministic is acceptable; we only want opacity, not confidentiality.
function ivFor(path: string, key: Buffer): Buffer {
  return crypto.createHash('sha256').update(key).update(':').update(path).digest().subarray(0, 12)
}

export function encodeStoragePath(path: string): string {
  const key = getKey()
  const iv = ivFor(path, key)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(path, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decodeStoragePath(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const data = raw.subarray(28)
    const key = getKey()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const path = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    if (!isValidObjectPath(path)) return null
    return path
  } catch {
    return null
  }
}

// Decode a base64url object path (produced by lib/avatar.ts `imgProxy`). This form
// is used for client-rendered images, where AES (which needs the server key) can't
// be produced. It only obfuscates the path; the path-shape check gates input.
export function decodeBase64Path(p: string): string | null {
  try {
    const path = Buffer.from(p, 'base64url').toString('utf8')
    if (!isValidObjectPath(path)) return null
    return path
  } catch {
    return null
  }
}

// Resolve a decoded object path back to the real public Supabase URL.
export function publicUrlForPath(path: string): string {
  return `${SUPABASE_URL}${PUBLIC_PREFIX}${path}`
}

// Watermark content images (listings, post/place bodies) but NOT avatars or small
// chat icons, where a stamp would look broken. Keyed by the bucket (first segment).
const WATERMARK_BUCKETS = new Set(['post-images', 'marketplace', 'place-images', 'places'])

export function shouldWatermark(path: string): boolean {
  return WATERMARK_BUCKETS.has(path.split('/')[0])
}

// Rewrite every <img> whose src points at this project's Supabase public storage so
// the storage URL is replaced by the opaque proxy URL. Other hosts are left as-is.
export function proxyStorageImages(html: string | null | undefined): string {
  if (!html || !SUPABASE_URL) return html ?? ''
  const escapedBase = SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `(<img\\b[^>]*?\\ssrc=)(["'])${escapedBase}${PUBLIC_PREFIX.replace(/\//g, '\\/')}([^"']+)\\2`,
    'gi',
  )
  return html.replace(re, (_m, pre: string, quote: string, path: string) => {
    // Strip any query string (e.g. cache-buster) before encoding the object path.
    const clean = path.split('?')[0].split('#')[0]
    return `${pre}${quote}/api/img?t=${encodeStoragePath(clean)}&v=2${quote}`
  })
}
