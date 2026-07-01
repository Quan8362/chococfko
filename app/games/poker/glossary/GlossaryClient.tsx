'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

export interface GlossaryTerm {
  key: string
  label: string
  def: string
}

export default function GlossaryClient({ terms }: { terms: GlossaryTerm[] }) {
  const t = useTranslations('games.poker')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return terms
    return terms.filter((term) => term.label.toLowerCase().includes(needle) || term.def.toLowerCase().includes(needle))
  }, [q, terms])

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">{t('glossary.title')}</h1>
      <p className="mb-4 text-sm text-muted">{t('glossary.subtitle')}</p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('glossary.search_ph')}
        className="mb-5 w-full max-w-md rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-rose"
      />

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted">{t('glossary.no_results')}</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {filtered.map((term) => (
            <div key={term.key} className="rounded-xl border border-line bg-paper p-4">
              <dt className="font-medium text-rose">{term.label}</dt>
              <dd className="mt-1 text-sm text-muted">{term.def}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
