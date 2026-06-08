'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { BookmarkItem, ItemType } from '@/app/tieng-nhat/bookmark-actions'
import JlptBadge from './JlptBadge'

type FilterType = 'all' | ItemType

const HREF: Record<ItemType, string> = {
  word: '/tieng-nhat/tu-dien',
  kanji: '/tieng-nhat/kanji',
  grammar: '/tieng-nhat/ngu-phap',
}

type Props = {
  bookmarks: BookmarkItem[]
}

export default function BookmarkList({ bookmarks }: Props) {
  const t = useTranslations('japanese')
  const [filter, setFilter] = useState<FilterType>('all')

  const tabs: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('filter_all') },
    { key: 'word', label: t('filter_word') },
    { key: 'kanji', label: t('filter_kanji') },
    { key: 'grammar', label: t('filter_grammar') },
  ]

  const filtered = filter === 'all' ? bookmarks : bookmarks.filter(b => b.itemType === filter)

  return (
    <div>
      {/* Tab filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === tab.key
                ? 'bg-rose text-white border-rose'
                : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span className="ml-1 opacity-70">
                ({bookmarks.filter(b => b.itemType === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-[14px] text-muted text-center py-10">{t('no_bookmarks')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(bm => (
            <Link
              key={bm.bmId}
              href={HREF[bm.itemType]}
              className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3 hover:border-rose/40 hover:shadow-sm transition-all group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[15px] text-ink group-hover:text-rose transition-colors truncate">
                    {bm.label}
                  </span>
                  {bm.subLabel && (
                    <span className="text-[12px] text-muted truncate">{bm.subLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                    bm.itemType === 'word' ? 'text-teal' :
                    bm.itemType === 'kanji' ? 'text-amber-600' : 'text-purple-600'
                  }`}>
                    {t(`filter_${bm.itemType}` as Parameters<typeof t>[0])}
                  </span>
                  {bm.jlptLevel && <JlptBadge level={bm.jlptLevel} />}
                </div>
              </div>
              <svg className="w-4 h-4 text-muted/50 flex-shrink-0 group-hover:text-rose/50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
