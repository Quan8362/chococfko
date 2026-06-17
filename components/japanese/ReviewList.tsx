import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { ReviewItem } from '@/app/japanese/bookmark-actions'
import JlptBadge from './JlptBadge'

type Props = { items: ReviewItem[] }

export default async function ReviewList({ items }: Props) {
  const t = await getTranslations('japanese')

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-[14px] text-muted text-center py-10">{t('no_review')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[15px] text-ink">{item.word}</span>
                    {item.reading && <span className="text-[12px] text-muted">{item.reading}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.jlptLevel && <JlptBadge level={item.jlptLevel} />}
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      item.status === 'review' ? 'text-amber-600' : 'text-teal'
                    }`}>
                      {item.status === 'review' ? t('filter_review') : t('filter_learning')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/japanese/flashcards"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-rose hover:underline"
          >
            {t('go_review')}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </>
      )}
    </div>
  )
}
