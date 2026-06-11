'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import KanjiCard, { type JapaneseKanji } from '@/components/japanese/KanjiCard'
import DictionarySearchBox from '@/components/japanese/DictionarySearchBox'
import EmptyState from '@/components/japanese/EmptyState'
import BookmarkButton from '@/components/japanese/BookmarkButton'
import Pagination from '@/components/japanese/Pagination'

const PAGE_SIZE = 24

interface KanjiClientProps {
  kanji: JapaneseKanji[]
  isLoggedIn: boolean
  initialBookmarkedKanjiIds: string[]
}

export default function KanjiClient({ kanji, isLoggedIn, initialBookmarkedKanjiIds }: KanjiClientProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bookmarkedSet = useMemo(() => new Set(initialBookmarkedKanjiIds), [])

  const displayed = useMemo(() => {
    if (!query.trim()) return kanji
    const q = query.trim().toLowerCase()
    return kanji.filter(k =>
      k.character.includes(q) ||
      k.onyomi?.some(r => r.toLowerCase().includes(q)) ||
      k.kunyomi?.some(r => r.toLowerCase().includes(q)) ||
      k.meanings?.some(m =>
        m.vi.toLowerCase().includes(q) || m.en.toLowerCase().includes(q)
      ) ||
      k.examples?.some(e =>
        e.word.includes(q) || e.vi.toLowerCase().includes(q) || e.en.toLowerCase().includes(q)
      )
    )
  }, [kanji, query])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [query])

  const pagedKanji = useMemo(
    () => displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayed, page],
  )

  const goToPage = (p: number) => {
    setPage(p)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const labels = {
    onyomi:       t('onyomi'),
    kunyomi:      t('kunyomi'),
    stroke_count: t('stroke_count'),
    radical:      t('radical'),
    example_words: t('example_words'),
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
        <EmptyState text={t('no_kanji')} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedKanji.map(k => (
              <KanjiCard
                key={k.id}
                kanji={k}
                locale={locale}
                labels={labels}
                actionSlot={
                  <BookmarkButton
                    itemId={k.id}
                    itemType="kanji"
                    initialBookmarked={bookmarkedSet.has(k.id)}
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
