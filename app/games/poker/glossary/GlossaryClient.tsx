'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Icon } from '../_eco/icons'
import { PageHeader, Eyebrow, EmptyState } from '../_eco/ui'

export type GlossaryCategory = 'actions' | 'betting' | 'cards' | 'position'

export interface GlossaryTerm {
  key: string
  label: string
  def: string
  category: GlossaryCategory
}

const CATEGORY_ORDER: GlossaryCategory[] = ['actions', 'betting', 'cards', 'position']
const CATEGORY_ICON: Record<GlossaryCategory, 'play' | 'coins' | 'layers' | 'target'> = {
  actions: 'play',
  betting: 'coins',
  cards: 'layers',
  position: 'target',
}
const CATEGORY_TONE: Record<GlossaryCategory, string> = {
  actions: 'ruby',
  betting: 'amber',
  cards: 'royal',
  position: 'violet',
}

export default function GlossaryClient({ terms }: { terms: GlossaryTerm[] }) {
  const t = useTranslations('games.poker')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<GlossaryCategory | 'all'>('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return terms.filter((term) => {
      if (cat !== 'all' && term.category !== cat) return false
      if (needle && !term.label.toLowerCase().includes(needle) && !term.def.toLowerCase().includes(needle)) return false
      return true
    })
  }, [q, cat, terms])

  const grouped = useMemo(() => {
    const map = new Map<GlossaryCategory, GlossaryTerm[]>()
    for (const c of CATEGORY_ORDER) map.set(c, [])
    for (const term of filtered) map.get(term.category)!.push(term)
    return CATEGORY_ORDER.map((c) => ({ category: c, items: map.get(c)! })).filter((g) => g.items.length > 0)
  }, [filtered])

  return (
    <div>
      <PageHeader
        eyebrow={<Eyebrow icon="list">{t('nav.glossary')}</Eyebrow>}
        icon="list"
        tone="violet"
        title={t('glossary.title')}
        subtitle={t('glossary.subtitle')}
      />

      {/* Search */}
      <div className="relative mb-3">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--pkp-ink-3)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('glossary.search_ph')}
          aria-label={t('glossary.search_ph')}
          className="pk-input h-12 pl-11 pr-10 text-base"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('join.cancel')}
            className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[color:var(--pkp-ink-3)] hover:bg-[color:var(--pkp-surface-2)] hover:text-[color:var(--pkp-ink)]"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Quick filters */}
      <div role="group" aria-label={t('glossary.title')} className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => setCat('all')} aria-pressed={cat === 'all'} className="pk-seg pk-btn-sm shrink-0">
          {t('lobby.filter_all')}
        </button>
        {CATEGORY_ORDER.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className="pk-seg pk-btn-sm shrink-0">
            <Icon name={CATEGORY_ICON[c]} size={14} /> {t(`glossary.cat.${c}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="search" title={t('glossary.no_results')} />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((g) => (
            <section key={g.category}>
              <h2 className="mb-2.5 flex items-center gap-2 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
                <span className={`pk-ichip pk-ichip-${CATEGORY_TONE[g.category]} h-7 w-7`}>
                  <Icon name={CATEGORY_ICON[g.category]} size={15} />
                </span>
                {t(`glossary.cat.${g.category}`)}
                <span className="text-sm font-normal text-[color:var(--pkp-ink-3)]">{g.items.length}</span>
              </h2>
              <dl className="grid gap-2 sm:grid-cols-2">
                {g.items.map((term) => (
                  <div key={term.key} className="pk-panel p-4">
                    <dt className="font-semibold text-[color:var(--pkp-ink)]">{term.label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[color:var(--pkp-ink-2)]">{term.def}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
