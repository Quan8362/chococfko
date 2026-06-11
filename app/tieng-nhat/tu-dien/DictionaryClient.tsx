'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DictionarySearchBox from '@/components/japanese/DictionarySearchBox'
import WordCard, { type JapaneseWord } from '@/components/japanese/WordCard'
import BookmarkButton from '@/components/japanese/BookmarkButton'
import CopyButton from '@/components/japanese/CopyButton'
import SearchSuggestions, { type SuggestionWord } from '@/components/japanese/SearchSuggestions'
import Pagination from '@/components/japanese/Pagination'

const HISTORY_KEY = 'jp_search_history'
const MAX_HISTORY = 10
const PAGE_SIZE = 12

function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

interface DictionaryClientProps {
  initialWords: JapaneseWord[]
  initialQuery: string
  isLoggedIn: boolean
  initialBookmarkedWordIds: string[]
}

export default function DictionaryClient({ initialWords, initialQuery, isLoggedIn, initialBookmarkedWordIds }: DictionaryClientProps) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<JapaneseWord[]>(initialWords)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestionWord[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const SUGGESTIONS_ID = 'jp-search-suggestions'
  const [history, setHistory] = useState<string[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const [resultsPage, setResultsPage] = useState(1)
  const [popularPage, setPopularPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = useMemo(() => createClient(), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bookmarkedSet = useMemo(() => new Set(initialBookmarkedWordIds), [])

  // Load history from localStorage (client-only)
  useEffect(() => {
    setHistory(readHistory())
    setHistoryReady(true)
  }, [])

  function saveToHistory(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, MAX_HISTORY)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }

  function clearHistory() {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }

  // Main full-detail search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults(initialWords)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('japanese_words')
        .select('id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency')
        .eq('is_published', true)
        .or(`word.ilike.%${q}%,reading.ilike.%${q}%,romaji.ilike.%${q}%,search_text.ilike.%${q}%`)
        .order('frequency', { ascending: false })
        .limit(20)
      setResults((data as JapaneseWord[]) ?? [])
      setLoading(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Lightweight suggestions query (faster, fewer columns)
  useEffect(() => {
    if (suggDebounceRef.current) clearTimeout(suggDebounceRef.current)
    const q = query.trim()
    if (!q) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    suggDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('japanese_words')
        .select('id,word,reading,jlpt_level,meanings')
        .eq('is_published', true)
        .or(`word.ilike.%${q}%,reading.ilike.%${q}%,romaji.ilike.%${q}%,search_text.ilike.%${q}%`)
        .order('frequency', { ascending: false })
        .limit(7)
      setSuggestions((data as SuggestionWord[]) ?? [])
      if ((data?.length ?? 0) > 0) setShowSuggestions(true)
    }, 200)
    return () => { if (suggDebounceRef.current) clearTimeout(suggDebounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Reset the keyboard highlight whenever the suggestion set changes.
  useEffect(() => { setActiveIndex(-1) }, [suggestions])

  function handleSuggestionSelect(word: string) {
    setQuery(word)
    setSuggestions([])
    setShowSuggestions(false)
    setActiveIndex(-1)
    saveToHistory(word)
  }

  function moveActive(dir: 1 | -1) {
    if (!suggestions.length) return
    if (!showSuggestions) setShowSuggestions(true)
    setActiveIndex(i => {
      if (dir === 1) return i < 0 ? 0 : (i + 1) % suggestions.length
      return i <= 0 ? suggestions.length - 1 : i - 1
    })
  }

  // Enter on a highlighted suggestion → go straight to its detail page.
  function handleEnterSelect(): boolean {
    if (showSuggestions && activeIndex >= 0 && suggestions[activeIndex]) {
      const w = suggestions[activeIndex].word
      saveToHistory(w)
      setShowSuggestions(false)
      setActiveIndex(-1)
      router.push(`/tieng-nhat/tu-dien/${encodeURIComponent(w)}`)
      return true
    }
    return false
  }

  function handleEscape() {
    setShowSuggestions(false)
    setActiveIndex(-1)
  }

  function handleHistoryClick(q: string) {
    setQuery(q)
    setShowSuggestions(false)
    saveToHistory(q)
  }

  function handleSearchFocus() {
    if (query.trim() && suggestions.length > 0) setShowSuggestions(true)
  }

  function handleSearchBlur() {
    setTimeout(() => setShowSuggestions(false), 180)
  }

  function handleSearchSubmit(v: string) {
    saveToHistory(v)
    setShowSuggestions(false)
  }

  const isSearching = query.trim().length > 0

  // Reset to first page whenever the underlying list changes.
  useEffect(() => { setResultsPage(1) }, [results])
  useEffect(() => { setPopularPage(1) }, [initialWords])

  const resultsTotalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const pagedResults = useMemo(
    () => results.slice((resultsPage - 1) * PAGE_SIZE, resultsPage * PAGE_SIZE),
    [results, resultsPage],
  )

  const popularTotalPages = Math.max(1, Math.ceil(initialWords.length / PAGE_SIZE))
  const pagedPopular = useMemo(
    () => initialWords.slice((popularPage - 1) * PAGE_SIZE, popularPage * PAGE_SIZE),
    [initialWords, popularPage],
  )

  function goToPage(setter: (p: number) => void, p: number) {
    setter(p)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cardFooter(w: JapaneseWord) {
    return (
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/40">
        <CopyButton text={w.word} label={t('copy_word')} copiedLabel={t('copied')} />
        <Link
          href={`/tieng-nhat/tu-dien/${encodeURIComponent(w.word)}`}
          className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-rose transition-colors"
        >
          {t('view_detail')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    )
  }

  function bookmarkSlot(w: JapaneseWord) {
    return (
      <BookmarkButton
        itemId={w.id}
        itemType="word"
        initialBookmarked={bookmarkedSet.has(w.id)}
        loginMessage={isLoggedIn ? undefined : t('login_to_save')}
      />
    )
  }

  return (
    <div>
      {/* Search box + suggestions dropdown */}
      <div className="relative">
        <DictionarySearchBox
          value={query}
          onChange={setQuery}
          placeholder={t('search_placeholder')}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onSubmit={handleSearchSubmit}
          onArrowDown={() => moveActive(1)}
          onArrowUp={() => moveActive(-1)}
          onEnterSelect={handleEnterSelect}
          onEscape={handleEscape}
          listboxId={SUGGESTIONS_ID}
          activeOptionId={activeIndex >= 0 ? `${SUGGESTIONS_ID}-opt-${activeIndex}` : undefined}
          expanded={showSuggestions && suggestions.length > 0}
          clearLabel={t('search_clear')}
        />
        {showSuggestions && (
          <SearchSuggestions
            suggestions={suggestions}
            onSelect={handleSuggestionSelect}
            locale={locale}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            listboxId={SUGGESTIONS_ID}
          />
        )}
      </div>

      {/* Empty-query state: history + popular words */}
      {!isSearching && (
        <div className="mt-7">
          {/* Search history */}
          {historyReady && history.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-muted uppercase tracking-wide">{t('search_history')}</p>
                <button
                  onClick={clearHistory}
                  className="text-[11px] text-muted hover:text-rose transition-colors"
                >
                  {t('clear_history')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map(h => (
                  <button
                    key={h}
                    onClick={() => handleHistoryClick(h)}
                    className="flex items-center gap-1.5 text-[13px] font-medium bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-full transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span lang="ja">{h}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular words */}
          <div>
            <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-4">{t('popular_words')}</p>
            {initialWords.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pagedPopular.map(w => (
                    <WordCard
                      key={w.id}
                      word={w}
                      locale={locale}
                      actionSlot={bookmarkSlot(w)}
                      footerSlot={cardFooter(w)}
                    />
                  ))}
                </div>
                <Pagination
                  currentPage={popularPage}
                  totalPages={popularTotalPages}
                  onPageChange={p => goToPage(setPopularPage, p)}
                />
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Search results */}
      {isSearching && (
        <div className="mt-6">
          {/* Status */}
          <div className="mb-4">
            {loading ? (
              <p className="text-[13px] text-muted animate-pulse">{t('loading')}…</p>
            ) : (
              <p className="text-[13px] text-muted">
                {t('search_results')} &mdash; <span className="font-medium text-ink">{results.length}</span>
              </p>
            )}
          </div>

          {/* Skeleton */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-paper border border-line rounded-2xl p-4 animate-pulse">
                  <div className="h-7 w-24 bg-line rounded mb-2" />
                  <div className="h-4 w-16 bg-line/60 rounded mb-3" />
                  <div className="h-4 w-40 bg-line/60 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Results grid */}
          {!loading && results.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pagedResults.map(w => (
                  <WordCard
                    key={w.id}
                    word={w}
                    locale={locale}
                    actionSlot={bookmarkSlot(w)}
                    footerSlot={cardFooter(w)}
                  />
                ))}
              </div>
              <Pagination
                currentPage={resultsPage}
                totalPages={resultsTotalPages}
                onPageChange={p => goToPage(setResultsPage, p)}
              />
            </>
          )}

          {/* Empty state */}
          {!loading && results.length === 0 && (
            <div className="text-center py-16">
              <div className="text-[48px] mb-4" aria-hidden>🔍</div>
              <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{t('no_results')}</h3>
              <p className="text-[14px] text-muted max-w-[320px] mx-auto">{t('no_results_sub')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
