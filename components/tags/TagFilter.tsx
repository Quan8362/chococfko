'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { TagContentType } from '@/lib/tags'

type TabKey = 'all' | TagContentType

const TAB_LABEL: Record<TabKey, 'all' | 'places' | 'community' | 'marketplace'> = {
  all: 'all',
  place: 'places',
  post: 'community',
  listing: 'marketplace',
}

/**
 * Content-type tabs for a tag page. Switches the `?type=` query param so the
 * server page re-renders the matching section. Hides tabs with zero results
 * (except "all").
 */
export default function TagFilter({
  active,
  counts,
}: {
  active: TabKey
  counts: Record<TabKey, number>
}) {
  const t = useTranslations('tags')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabs = (['all', 'place', 'post', 'listing'] as TabKey[]).filter(
    (key) => key === 'all' || counts[key] > 0,
  )

  function select(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'all') params.delete('type')
    else params.set('type', key)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => select(key)}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
            active === key
              ? 'border-rose bg-rose text-white'
              : 'border-line bg-paper text-muted hover:border-rose/40 hover:text-rose'
          }`}
        >
          {t(TAB_LABEL[key])}
          <span className={`ml-1.5 ${active === key ? 'text-white/80' : 'text-muted/70'}`}>
            {counts[key]}
          </span>
        </button>
      ))}
    </div>
  )
}
