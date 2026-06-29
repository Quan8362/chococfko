'use client'

import { useState } from 'react'
import { avatarSrc, bumpAvatarSize } from '@/lib/avatar'
import type { CoinTier } from '@/lib/games/coinTier'
import { CoinTierBadge } from './CoinTierBadge'

// Single, canonical avatar renderer for the whole site. Guarantees a perfect
// circle (fixed square box + object-cover/center + overflow-hidden) so images
// are never stretched or squeezed, bumps low-res provider avatars to a crisp
// size, and falls back to tidy initials when the image is missing or errors.
//
// Avatar source priority is resolved by the caller (profiles.avatar_url →
// auth metadata → provider picture). Pass that resolved url as `src`.
//
// Dynamic coin-rank badge: pass `tier` (derived from the user's CURRENT balance via
// getCoinTier) + a localized `tierLabel`; an emblem is overlaid at the bottom-right edge
// so it never hides the face. Both props are optional — every existing caller is
// unchanged (no badge unless a tier is supplied), and the badge wrapper is only added
// when a badge is shown, so unrelated layouts are untouched.

function initialFrom(name?: string | null, email?: string | null): string {
  const base = (name && name.trim()) || (email ? email.split('@')[0] : '') || ''
  const first = Array.from(base.trim())[0] // code-point safe (vi/ja/en)
  return first ? first.toUpperCase() : '?'
}

function badgeSizeFor(px: number): 'xs' | 'sm' | 'md' {
  return px >= 52 ? 'md' : px >= 40 ? 'sm' : 'xs'
}

export default function UserAvatar({
  src,
  name,
  email,
  size = 32,
  className = '',
  alt,
  tier = null,
  tierLabel,
}: {
  src?: string | null
  name?: string | null
  email?: string | null
  size?: number
  className?: string
  /** Extra alt text; defaults to the display name. */
  alt?: string
  /** Current coin tier (from getCoinTier(balance)); null/omitted → no badge. */
  tier?: CoinTier | null
  /** Localized accessible name + tooltip for the badge (required to show it). */
  tierLabel?: string
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size, minWidth: size, minHeight: size }
  const label = alt ?? (name || 'User avatar')

  const inner =
    src && !failed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc(bumpAvatarSize(src, size))}
        alt={label}
        width={size}
        height={size}
        decoding="async"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-cream object-cover object-center ${className}`}
        style={{ ...box, objectFit: 'cover', objectPosition: 'center' }}
      />
    ) : (
      <span
        aria-label={label}
        role="img"
        className={`shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full bg-rose font-semibold text-white leading-none select-none ${className}`}
        style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      >
        {initialFrom(name, email)}
      </span>
    )

  if (tier && tierLabel) {
    return (
      <span className="relative inline-flex flex-none align-middle" style={box}>
        {inner}
        <CoinTierBadge
          tier={tier}
          size={badgeSizeFor(size)}
          label={tierLabel}
          className="absolute -bottom-0.5 -right-0.5 drop-shadow-sm"
        />
      </span>
    )
  }

  return inner
}
