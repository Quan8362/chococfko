'use client'

// ── PokerAvatar ──────────────────────────────────────────────────────────────────────────────
// ONE reusable player avatar for the whole portal. Fixed 1:1 ratio, object-fit cover, graceful
// source handling: while an image loads we show a tinted placeholder; on error (or when there is
// no usable src) we fall back to the player's initials — NEVER the browser's broken-image glyph.
// Accessible: decorative when a visible name sits beside it (empty alt), otherwise labelled.

import { useEffect, useMemo, useState } from 'react'
import { avatarSrc, bumpAvatarSize } from '@/lib/avatar'

interface Props {
  src?: string | null
  name?: string | null
  /** px diameter */
  size?: number
  /** subtle champagne-gold ring */
  ring?: boolean
  /** when true the name is shown next to the avatar, so the avatar itself is decorative */
  decorative?: boolean
  className?: string
}

function initials(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return '♠'
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic tint from the name so avatars aren't a uniform block, but stay on-palette.
const TINTS = [
  { bg: 'var(--pkp-ruby-tint)', fg: 'var(--pkp-ruby-ink)' },
  { bg: 'var(--pkp-emerald-tint)', fg: 'var(--pkp-emerald-ink)' },
  { bg: 'var(--pkp-royal-tint)', fg: 'var(--pkp-royal-ink)' },
  { bg: 'var(--pkp-violet-tint)', fg: 'var(--pkp-violet-ink)' },
  { bg: 'var(--pkp-amber-tint)', fg: 'var(--pkp-amber-ink)' },
]
function tintFor(name: string | null | undefined) {
  const s = (name ?? '').trim()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

function usableSrc(src?: string | null): string | null {
  if (!src) return null
  const s = src.trim()
  if (!s || s === 'null' || s === 'undefined') return null
  return s
}

export default function PokerAvatar({ src, name, size = 44, ring = false, decorative, className }: Props) {
  // Route provider/Supabase avatars through the same proxy + retina upscaling the rest of the
  // site uses (bumpAvatarSize before avatarSrc), so blocked-host (Google/Facebook) OAuth avatars
  // actually load instead of failing to the initials fallback.
  const clean = useMemo(() => {
    const raw = usableSrc(src)
    return raw ? avatarSrc(bumpAvatarSize(raw, size)) || null : null
  }, [src, size])
  const [status, setStatus] = useState<'idle' | 'loaded' | 'error'>('idle')
  const tint = useMemo(() => tintFor(name), [name])

  // Reset load state if the source changes.
  useEffect(() => { setStatus('idle') }, [clean])

  const showImg = clean && status !== 'error'
  const label = (name ?? '').trim() || undefined

  return (
    <span
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        position: 'relative',
        height: size,
        width: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        background: tint.bg,
        color: tint.fg,
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        lineHeight: 1,
        boxShadow: ring
          ? '0 0 0 2px var(--pkp-surface), 0 0 0 3px var(--pkp-gold-line)'
          : 'inset 0 0 0 1px rgba(52,33,14,0.08)',
      }}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : label}
    >
      {/* initials sit underneath; the image (when present) covers them once loaded */}
      <span aria-hidden style={{ position: 'absolute', userSelect: 'none' }}>{initials(name)}</span>
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clean}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          style={{
            position: 'absolute',
            inset: 0,
            height: '100%',
            width: '100%',
            objectFit: 'cover',
            opacity: status === 'loaded' ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />
      )}
    </span>
  )
}
