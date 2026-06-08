'use client'

import { useState, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import GrammarCard, { type JapaneseGrammar } from '@/components/japanese/GrammarCard'
import DictionarySearchBox from '@/components/japanese/DictionarySearchBox'
import EmptyState from '@/components/japanese/EmptyState'
import BookmarkButton from '@/components/japanese/BookmarkButton'

interface GrammarClientProps {
  grammar: JapaneseGrammar[]
  isLoggedIn: boolean
  initialBookmarkedGrammarIds: string[]
}

export default function GrammarClient({ grammar, isLoggedIn, initialBookmarkedGrammarIds }: GrammarClientProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bookmarkedSet = useMemo(() => new Set(initialBookmarkedGrammarIds), [])

  const displayed = useMemo(() => {
    if (!query.trim()) return grammar
    const q = query.trim().toLowerCase()
    return grammar.filter(g =>
      g.pattern.toLowerCase().includes(q) ||
      g.meaning_vi?.toLowerCase().includes(q) ||
      g.meaning_en?.toLowerCase().includes(q) ||
      g.structure?.toLowerCase().includes(q) ||
      g.examples?.some(e =>
        e.ja.includes(q) || e.vi.toLowerCase().includes(q) || e.en.toLowerCase().includes(q)
      )
    )
  }, [grammar, query])

  const labels = {
    structure: t('grammar_structure'),
    notes:     t('grammar_notes'),
  }

  return (
    <div>
      <div className="mb-5">
        <DictionarySearchBox
          value={query}
          onChange={setQuery}
          placeholder={t('search_placeholder')}
        />
      </div>

      {displayed.length === 0 ? (
        <EmptyState text={t('no_grammar')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map(g => (
            <GrammarCard
              key={g.id}
              grammar={g}
              locale={locale}
              labels={labels}
              actionSlot={
                <BookmarkButton
                  itemId={g.id}
                  itemType="grammar"
                  initialBookmarked={bookmarkedSet.has(g.id)}
                  loginMessage={isLoggedIn ? undefined : t('login_to_save')}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
