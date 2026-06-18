import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { getLocalizedTagName, type LocalizedTag } from '@/lib/tags'

// A tag chip carries its slug + per-locale display names so it can render
// localized for the current UI language (falling back to the original name).
export type TagChip = LocalizedTag

/**
 * Rounded pill (or flush-text) list of tags linking to their filter page.
 * Server component — resolves the current locale and shows localized names.
 * Used on detail pages, content cards, search & admin views.
 */
export default async function TagList({
  tags,
  size = 'md',
  variant = 'solid',
  className = '',
}: {
  tags: TagChip[]
  size?: 'sm' | 'md'
  /** 'solid' = rounded pill chips; 'plain' = flush text links (#tag) for cards */
  variant?: 'solid' | 'plain'
  className?: string
}) {
  if (!tags || tags.length === 0) return null
  const locale = await getLocale()
  const textSize = size === 'sm' ? 'text-[11.5px]' : 'text-[12.5px]'

  if (variant === 'plain') {
    // Flush-left text links so the first "#" lines up with the rows above (no
    // pill padding offset). Used on content cards.
    return (
      <div className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={`/tags/${tag.slug}`}
            className={`max-w-full truncate text-rose/90 hover:text-rose hover:underline font-medium ${textSize}`}
          >
            #{getLocalizedTagName(tag, locale)}
          </Link>
        ))}
      </div>
    )
  }

  const pad = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1'
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={`/tags/${tag.slug}`}
          className={`inline-flex items-center max-w-full rounded-full bg-rose/8 text-rose hover:bg-rose/15 transition-colors font-medium ${pad} ${textSize}`}
        >
          <span className="truncate">#{getLocalizedTagName(tag, locale)}</span>
        </Link>
      ))}
    </div>
  )
}
