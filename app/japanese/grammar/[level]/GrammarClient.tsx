'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import GrammarCard, { type JapaneseGrammar } from '@/components/japanese/GrammarCard'
import DictionarySearchBox from '@/components/japanese/DictionarySearchBox'
import EmptyState from '@/components/japanese/EmptyState'
import BookmarkButton from '@/components/japanese/BookmarkButton'
import Pagination from '@/components/japanese/Pagination'

const PAGE_SIZE = 24

interface GrammarClientProps {
  grammar: JapaneseGrammar[]
  isLoggedIn: boolean
  initialBookmarkedGrammarIds: string[]
  commentCounts?: Record<string, number>
}

export default function GrammarClient({ grammar, isLoggedIn, initialBookmarkedGrammarIds, commentCounts }: GrammarClientProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
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

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [query])

  const pagedGrammar = useMemo(
    () => displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayed, page],
  )

  const goToPage = (p: number) => {
    setPage(p)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pagedGrammar.map(g => (
              <GrammarCard
                key={g.id}
                grammar={g}
                locale={locale}
                labels={labels}
                detailHref={`/japanese/grammar/item/${g.id}`}
                detailLabel={t('detail_comment')}
                commentCount={commentCounts?.[g.id]}
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
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
