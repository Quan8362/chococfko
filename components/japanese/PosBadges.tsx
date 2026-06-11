'use client'

import { useTranslations } from 'next-intl'
import { getPartOfSpeechKeys } from '@/lib/japanese/partOfSpeech'

interface PosBadgesProps {
  /** Raw POS value: single string, comma-separated string, array, or null/undefined. */
  value: string | string[] | null | undefined
  /** "detail" = prominent rose badges; "compact" = small neutral pills for cards. */
  variant?: 'detail' | 'compact'
  /** Optional cap on how many badges to render. */
  max?: number
  className?: string
}

const VARIANT_STYLE: Record<NonNullable<PosBadgesProps['variant']>, string> = {
  detail:
    'text-[11px] font-semibold bg-rose/8 text-rose border border-rose/20 px-2.5 py-0.5 rounded-full',
  compact:
    'text-[10px] font-semibold text-muted/80 bg-cream border border-line px-1.5 py-0.5 rounded-full',
}

export default function PosBadges({ value, variant = 'detail', max, className = '' }: PosBadgesProps) {
  const t = useTranslations('japanese')
  let keys = getPartOfSpeechKeys(value)
  if (keys.length === 0) return null
  if (typeof max === 'number') keys = keys.slice(0, max)

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {keys.map(key => (
        <span key={key} className={VARIANT_STYLE[variant]}>
          {t.has(key) ? t(key) : t('pos_unknown')}
        </span>
      ))}
    </div>
  )
}
