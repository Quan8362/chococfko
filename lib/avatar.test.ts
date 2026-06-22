import { test } from 'node:test'
import assert from 'node:assert/strict'

// Set the Supabase URL BEFORE the module is first imported so its module-level
// SUPABASE_PUBLIC prefix is populated. avatar.ts is imported dynamically below.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
const { avatarSrc, bumpAvatarSize } = await import('./avatar.ts')

// The leaderboard MUST use this same resolver as the header (UserAvatar) so the
// avatar matches and OAuth/Supabase URLs are proxied rather than shown raw.

test('avatarSrc proxies blocked OAuth hosts (Google / Facebook)', () => {
  assert.ok(avatarSrc('https://lh3.googleusercontent.com/a/abc=s96-c').startsWith('/api/avatar?url='))
  assert.ok(avatarSrc('https://scontent.fbcdn.net/v/pic.jpg').startsWith('/api/avatar?url='))
})

test('Supabase storage avatars route through the same-origin image proxy', () => {
  const out = avatarSrc('https://proj.supabase.co/storage/v1/object/public/avatars/u.png')
  assert.ok(out.startsWith('/api/img?p='), out)
  assert.ok(!out.includes('supabase.co'), 'raw supabase host must not leak into the DOM')
})

test('avatarSrc passes through local / data / blob / other CDN URLs', () => {
  assert.equal(avatarSrc('/uploads/a.png'), '/uploads/a.png')
  assert.equal(avatarSrc('data:image/png;base64,xxx'), 'data:image/png;base64,xxx')
  assert.equal(avatarSrc('blob:abc'), 'blob:abc')
  assert.equal(avatarSrc('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
})

test('avatarSrc returns empty for null/empty (→ initials fallback)', () => {
  assert.equal(avatarSrc(null), '')
  assert.equal(avatarSrc(undefined), '')
  assert.equal(avatarSrc(''), '')
})

test('avatarSrc never embeds an email address', () => {
  assert.ok(!avatarSrc('https://lh3.googleusercontent.com/a/abc=s96-c').includes('@'))
})

test('bumpAvatarSize upsizes provider thumbnails, leaves others intact', () => {
  assert.equal(bumpAvatarSize('https://x/a=s96-c', 200), 'https://x/a=s400-c') // 200→target 400
  assert.match(bumpAvatarSize('https://x/pic?sz=96', 200), /sz=400/)
  assert.equal(bumpAvatarSize('https://x/s96-c/pic', 200), 'https://x/s400-c/pic')
  assert.equal(bumpAvatarSize('https://cdn.example.com/a.png', 28), 'https://cdn.example.com/a.png')
  assert.equal(bumpAvatarSize('', 28), '')
})
