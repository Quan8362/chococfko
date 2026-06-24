'use client'

import Link from 'next/link'
import type { Scope } from '@/lib/access'

// Community vs FKO-internal scope switcher — the single source of truth for the
// segmented "Cộng đồng / 🔒 Nội bộ FKO" control site-wide (Confessions, Chat…).
// ONE active style everywhere: brand pink. Two modes:
//   - navigation (Confessions): pass communityHref / internalHref → renders <Link>.
//   - action (Chat): pass onSelect → renders <button> (client-side scope switch).
// Community viewers (canInternal=false) see a single, intentional-looking heading
// (the internal tab is never rendered — no locked placeholder, no count, no hint).
export default function ScopeTabs({
  scope,
  canInternal,
  communityHref,
  internalHref,
  onSelect,
  communityLabel,
  internalLabel,
  variant = 'default',
  className,
}: {
  scope: Scope
  canInternal: boolean
  communityHref?: string
  internalHref?: string
  onSelect?: (next: Scope) => void
  communityLabel: string
  internalLabel: string
  variant?: 'default' | 'compact'
  className?: string
}) {
  if (!canInternal) {
    return (
      <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink mb-5">
        {communityLabel}
      </h2>
    )
  }

  const base =
    variant === 'compact'
      ? 'flex-1 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold py-1.5 rounded-lg border transition-all whitespace-nowrap'
      : 'inline-flex items-center gap-1.5 text-[13.5px] font-semibold px-5 py-2.5 rounded-full border transition-all whitespace-nowrap'
  const active = 'bg-rose text-white border-rose shadow-[0_2px_12px_rgba(194,24,91,0.3)]'
  const idle = 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'

  const wrap =
    className ?? (variant === 'compact' ? 'flex items-center gap-1.5' : 'flex items-center gap-2 mb-5')

  // Action mode (Chat): client-side scope switch via buttons.
  if (onSelect) {
    return (
      <div className={wrap}>
        <button
          type="button"
          onClick={() => onSelect('community')}
          className={`${base} ${scope === 'community' ? active : idle}`}
        >
          {communityLabel}
        </button>
        <button
          type="button"
          onClick={() => onSelect('fko_internal')}
          className={`${base} ${scope === 'fko_internal' ? active : idle}`}
        >
          {internalLabel}
        </button>
      </div>
    )
  }

  // Navigation mode (Confessions): real links for SEO / shareable URLs.
  return (
    <div className={wrap}>
      <Link href={communityHref!} className={`${base} ${scope === 'community' ? active : idle}`}>
        {communityLabel}
      </Link>
      <Link href={internalHref!} className={`${base} ${scope === 'fko_internal' ? active : idle}`}>
        {internalLabel}
      </Link>
    </div>
  )
}
