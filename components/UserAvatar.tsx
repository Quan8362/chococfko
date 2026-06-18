'use client'

import { useState } from 'react'
import { avatarSrc, bumpAvatarSize } from '@/lib/avatar'

// Single, canonical avatar renderer for the whole site. Guarantees a perfect
// circle (fixed square box + object-cover/center + overflow-hidden) so images
// are never stretched or squeezed, bumps low-res provider avatars to a crisp
// size, and falls back to tidy initials when the image is missing or errors.
//
// Avatar source priority is resolved by the caller (profiles.avatar_url →
// auth metadata → provider picture). Pass that resolved url as `src`.

function initialFrom(name?: string | null, email?: string | null): string {
  const base = (name && name.trim()) || (email ? email.split('@')[0] : '') || ''
  const first = Array.from(base.trim())[0] // code-point safe (vi/ja/en)
  return first ? first.toUpperCase() : '?'
}

export default function UserAvatar({
  src,
  name,
  email,
  size = 32,
  className = '',
  alt,
}: {
  src?: string | null
  name?: string | null
  email?: string | null
  size?: number
  className?: string
  /** Extra alt text; defaults to the display name. */
  alt?: string
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size, minWidth: size, minHeight: size }
  const label = alt ?? (name || 'User avatar')

  if (src && !failed) {
    return (
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
    )
  }

  return (
    <span
      aria-label={label}
      role="img"
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full bg-rose font-semibold text-white leading-none select-none ${className}`}
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.42)) }}
    >
      {initialFrom(name, email)}
    </span>
  )
}
