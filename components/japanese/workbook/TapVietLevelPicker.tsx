'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

export interface WorkbookLevelInfo {
  /** Route + localStorage key, e.g. 'n5', 'joyo-1'. */
  key: string
  badge: React.ReactNode
  title: string
  desc: string
  count: number
  totalPages: number
  href: string
}

interface Props {
  levels: WorkbookLevelInfo[]
}

export default function TapVietLevelPicker({ levels }: Props) {
  const t = useTranslations('japanese')
  const [doneByKey, setDoneByKey] = useState<Record<string, number>>({})

  useEffect(() => {
    const result: Record<string, number> = {}
    for (const { key } of levels) {
      try {
        const saved = JSON.parse(localStorage.getItem(`chococfko_tapviet_done_${key}`) ?? '[]')
        result[key] = Array.isArray(saved) ? saved.length : 0
      } catch {
        result[key] = 0
      }
    }
    setDoneByKey(result)
  }, [levels])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {levels.map(({ key, badge, title, desc, count, totalPages, href }) => {
        const done = doneByKey[key] ?? 0
        const pct = totalPages > 0 ? Math.round((Math.min(done, totalPages) / totalPages) * 100) : 0
        const empty = count === 0
        return (
          <Link
            key={key}
            href={href}
            className={`group bg-paper border border-line rounded-2xl p-5 transition-all ${
              empty
                ? 'opacity-70'
                : 'hover:border-rose/30 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.15)] hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              {badge}
              <span className="text-[12px] text-muted">
                {count} {t('writing_unit_kanji')}
              </span>
            </div>
            <h3 className="font-serif font-bold text-[17px] text-ink group-hover:text-rose transition-colors mb-1">
              {title}
            </h3>
            <p className="text-[13px] text-muted leading-snug mb-4">{desc}</p>

            {totalPages > 0 && (
              <div className="mb-3">
                <div className="h-1.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full bg-rose rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-muted mt-1 inline-block">
                  {t('writing_progress', { done, total: totalPages })}
                </span>
              </div>
            )}

            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
              {t('writing')}
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** Small grade badge for Jōyō cards (teal/gold), distinct from JLPT badges. */
export function JoyoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal/10 text-teal border border-teal/20">
      {label}
    </span>
  )
}
