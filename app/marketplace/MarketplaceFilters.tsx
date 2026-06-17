'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CATEGORIES, SORTS } from '@/lib/marketplace'

type Props = {
  q: string
  category: string
  type: string
  condition: string
  sort: string
}

export default function MarketplaceFilters(current: Props) {
  const t = useTranslations('marketplace')
  const router = useRouter()
  const [q, setQ] = useState(current.q)

  function apply(patch: Partial<Props>) {
    const next = { ...current, q, ...patch }
    const params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.category && next.category !== 'all') params.set('category', next.category)
    if (next.type) params.set('type', next.type)
    if (next.condition) params.set('condition', next.condition)
    if (next.sort && next.sort !== 'newest') params.set('sort', next.sort)
    const qs = params.toString()
    router.push(qs ? `/marketplace?${qs}` : '/marketplace')
  }

  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all border ${
      active ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'
    }`

  return (
    <div className="space-y-3">
      {/* Search + sort */}
      <div className="flex gap-2.5 flex-wrap">
        <form
          onSubmit={(e) => { e.preventDefault(); apply({}) }}
          className="relative flex-1 min-w-[200px]"
        >
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-line bg-paper text-[14px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
          />
        </form>
        <div className="relative">
          <select
            value={current.sort || 'newest'}
            onChange={(e) => apply({ sort: e.target.value })}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-full border border-line bg-paper text-[13.5px] font-medium text-ink focus:outline-none focus:border-rose/50 cursor-pointer"
          >
            {SORTS.map(s => <option key={s} value={s}>{t(`sort_${s}` as Parameters<typeof t>[0])}</option>)}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Type + condition */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => apply({ type: '' })} className={chip(!current.type)}>{t('filter_all')}</button>
        <button onClick={() => apply({ type: 'sell' })} className={chip(current.type === 'sell')}>💰 {t('type_sell')}</button>
        <button onClick={() => apply({ type: 'free' })} className={chip(current.type === 'free')}>🎁 {t('type_free')}</button>
        <button onClick={() => apply({ type: 'auction' })} className={chip(current.type === 'auction')}>🔨 {t('type_auction')}</button>
        <span className="w-px h-5 bg-line mx-1" />
        <button onClick={() => apply({ condition: '' })} className={chip(!current.condition)}>{t('cond_any')}</button>
        <button onClick={() => apply({ condition: 'new' })} className={chip(current.condition === 'new')}>{t('cond_new')}</button>
        <button onClick={() => apply({ condition: 'used' })} className={chip(current.condition === 'used')}>{t('cond_used')}</button>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => apply({ category: 'all' })} className={chip(!current.category || current.category === 'all')}>{t('cat_all')}</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => apply({ category: c })} className={chip(current.category === c)}>
            {t(`cat_${c}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
    </div>
  )
}
