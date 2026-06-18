import Link from 'next/link'

export interface TagChip {
  name: string
  slug: string
}

/**
 * Rounded pill list of tags linking to their filter page. Server component
 * (plain links). Used on detail pages, content cards, search & admin views.
 */
export default function TagList({
  tags,
  size = 'md',
  className = '',
}: {
  tags: TagChip[]
  size?: 'sm' | 'md'
  className?: string
}) {
  if (!tags || tags.length === 0) return null
  const pad = size === 'sm' ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-3 py-1 text-[12.5px]'
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={`/tags/${tag.slug}`}
          className={`inline-flex items-center max-w-full rounded-full bg-rose/8 text-rose hover:bg-rose/15 transition-colors font-medium ${pad}`}
        >
          <span className="truncate">#{tag.name}</span>
        </Link>
      ))}
    </div>
  )
}
