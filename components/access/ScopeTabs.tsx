import Link from 'next/link'
import type { Scope } from '@/lib/access'

// Community vs FKO-internal scope switcher.
// - Internal/admin viewers see two pills.
// - Community viewers see a single, intentional-looking heading (the internal
//   tab is never rendered — no locked placeholder, no count, no hint).
export default function ScopeTabs({
  scope,
  canInternal,
  communityHref,
  internalHref,
  communityLabel,
  internalLabel,
}: {
  scope: Scope
  canInternal: boolean
  communityHref: string
  internalHref: string
  communityLabel: string
  internalLabel: string
}) {
  if (!canInternal) {
    return (
      <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink mb-5">
        {communityLabel}
      </h2>
    )
  }

  const base =
    'inline-flex items-center gap-1.5 text-[13.5px] font-semibold px-5 py-2.5 rounded-full border transition-all whitespace-nowrap'
  const active = 'bg-rose text-white border-rose shadow-[0_2px_12px_rgba(194,24,91,0.3)]'
  const idle = 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'

  return (
    <div className="flex items-center gap-2 mb-5">
      <Link href={communityHref} className={`${base} ${scope === 'community' ? active : idle}`}>
        {communityLabel}
      </Link>
      <Link
        href={internalHref}
        className={`${base} ${scope === 'fko_internal' ? active : idle}`}
      >
        {internalLabel}
      </Link>
    </div>
  )
}
