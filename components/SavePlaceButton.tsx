'use client'

import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'

interface Props {
  slug: string
  name: string
  // kept for call-site compatibility (cards pass these); not needed for DB saves.
  area?: string
  img?: string
  categoryLabel?: string
  size?: 'sm' | 'md'
}

/**
 * Save/unsave toggle. State comes from SavedPlacesProvider so it stays in sync
 * across cards, map previews, and the detail page (DB for logged-in users,
 * localStorage for guests).
 */
export default function SavePlaceButton({ slug, name, size = 'sm' }: Props) {
  const t = useTranslations('common')
  const { isSaved, toggle } = useSavedPlaces()
  const saved = isSaved(slug)

  const sz = size === 'md' ? 'w-9 h-9 text-[18px]' : 'w-7 h-7 text-[14px]'

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(slug) }}
      aria-label={saved ? t('unsave_place', { name }) : t('save_place', { name })}
      aria-pressed={saved}
      title={saved ? t('unsave_place', { name }) : t('save_place', { name })}
      className={`${sz} flex items-center justify-center rounded-full transition-all duration-200 ${
        saved
          ? 'bg-rose text-white shadow-[0_2px_8px_-2px_rgba(194,24,91,0.5)]'
          : 'bg-paper/90 text-muted border border-line hover:border-rose/40 hover:text-rose'
      }`}
    >
      {saved ? '♥' : '♡'}
    </button>
  )
}
