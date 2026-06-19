'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ARTICLE_ICON_SECTIONS } from '@/lib/editor/iconSections'

// Accent-insensitive lowercase so "am thuc" matches "Ẩm thực".
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Searchable, category-grouped menu for inserting a styled icon section heading.
 * Rendered inside the toolbar dropdown; calls onPick(icon, label) with the label
 * already translated to the writer's language.
 */
export default function IconSectionMenu({
  onPick,
}: {
  onPick: (icon: string, label: string) => void
}) {
  const t = useTranslations('post_form')
  const [q, setQ] = useState('')
  const query = norm(q.trim())

  const groups = useMemo(() => {
    if (!query) return ARTICLE_ICON_SECTIONS
    return ARTICLE_ICON_SECTIONS
      .map((g) => ({
        ...g,
        // Search both the label and the full insert text so keywords only in the
        // long form (e.g. "đi chơi", "sau giờ làm") still match.
        items: g.items.filter((it) =>
          norm(`${t(it.key)} ${it.insertKey ? t(it.insertKey) : ''}`).includes(query),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [query, t])

  return (
    <div className="w-[min(280px,calc(100vw-2.5rem))]">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('isec_search_placeholder')}
        className="w-full mb-2 px-2.5 py-1.5 text-[12.5px] rounded-lg border border-line bg-paper text-ink placeholder:text-muted/70 focus:outline-none focus:border-rose/50"
      />
      <div className="max-h-[300px] overflow-y-auto pr-0.5">
        {groups.length === 0 ? (
          <p className="text-[12px] text-muted px-1 py-3 text-center">{t('isec_no_results')}</p>
        ) : (
          groups.map((g) => (
            <div key={g.categoryKey} className="mb-2 last:mb-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted/70 px-1 mb-1">
                {t(g.categoryKey)}
              </p>
              {g.items.map((it) => {
                const label = t(it.key)
                const insertText = it.insertKey ? t(it.insertKey) : label
                return (
                  <button
                    key={it.key}
                    type="button"
                    onMouseDown={(ev) => { ev.preventDefault(); onPick(it.icon, insertText) }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-rose-soft/60 text-ink flex items-center gap-2 text-[12.5px]"
                  >
                    <span className="text-[15px] leading-none w-5 text-center flex-none">{it.icon}</span>
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
