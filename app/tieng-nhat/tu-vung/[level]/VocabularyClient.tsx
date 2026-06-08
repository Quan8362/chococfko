'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import VocabularyCard, { type ProgressStatus } from '@/components/japanese/VocabularyCard'
import ProgressBar from '@/components/japanese/ProgressBar'
import DictionarySearchBox from '@/components/japanese/DictionarySearchBox'
import type { JapaneseWord } from '@/components/japanese/WordCard'
import { saveWordProgress, type ProgressAction, type ProgressMap } from '@/app/tieng-nhat/actions'

type FilterTab = 'all' | 'learning' | 'review' | 'mastered'

interface VocabularyClientProps {
  words: JapaneseWord[]
  initialProgress: ProgressMap
  isLoggedIn: boolean
  level: string
}

export default function VocabularyClient({
  words,
  initialProgress,
  isLoggedIn,
  level,
}: VocabularyClientProps) {
  const t = useTranslations('japanese')
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgress)
  const [query, setQuery]   = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const showMsg = (text: string, ok: boolean) => {
    setSaveMsg({ text, ok })
    setTimeout(() => setSaveMsg(null), 2000)
  }

  const handleAction = useCallback(async (wordId: string, action: ProgressAction) => {
    const optimisticStatus: ProgressStatus =
      action === 'correct' ? 'mastered' : action === 'review' ? 'review' : 'learning'

    setProgressMap(p => ({ ...p, [wordId]: optimisticStatus }))

    const result = await saveWordProgress(wordId, action)
    if ('error' in result) {
      showMsg(t('progress_failed'), false)
    } else {
      showMsg(t('progress_saved'), true)
    }
  }, [t])

  const displayedWords = useMemo(() => {
    let list = words

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(w =>
        w.word.includes(q) ||
        w.reading?.includes(q) ||
        w.romaji?.toLowerCase().includes(q) ||
        w.meanings?.[0]?.vi?.toLowerCase().includes(q) ||
        w.meanings?.[0]?.en?.toLowerCase().includes(q)
      )
    }

    if (filter !== 'all') {
      list = list.filter(w => progressMap[w.id] === filter)
    }

    return list
  }, [words, query, filter, progressMap])

  const masterCount   = words.filter(w => progressMap[w.id] === 'mastered').length
  const reviewCount   = words.filter(w => progressMap[w.id] === 'review').length
  const learningCount = words.filter(w => progressMap[w.id] === 'learning').length
  const total = words.length

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: t('filter_all') },
    { key: 'learning', label: t('filter_learning') },
    { key: 'review',   label: t('filter_review') },
    { key: 'mastered', label: t('filter_mastered') },
  ]

  return (
    <div>
      {/* Progress overview */}
      {isLoggedIn && total > 0 && (masterCount + reviewCount + learningCount) > 0 && (
        <div className="bg-paper border border-line rounded-2xl p-4 mb-6">
          <p className="text-[12px] text-muted font-semibold uppercase tracking-wide mb-3">
            {t('progress_label')}
          </p>
          <ProgressBar
            total={total}
            mastered={masterCount}
            review={reviewCount}
            learning={learningCount}
          />
        </div>
      )}

      {/* Flashcard CTA */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <p className="text-[14px] text-muted">
          {t('words_count', { count: total })}
        </p>
        <Link
          href={`/tieng-nhat/flashcard?level=${level}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose bg-rose/8 border border-rose/20 px-3.5 py-2 rounded-xl hover:bg-rose/15 transition-colors"
        >
          🃏 {t('study_flashcard')}
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <DictionarySearchBox
          value={query}
          onChange={setQuery}
          placeholder={t('search_placeholder')}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`shrink-0 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-rose text-white'
                : 'bg-cream text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {saveMsg && (
        <div className={`text-center text-[12.5px] py-2 px-4 rounded-xl mb-4 ${
          saveMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose/10 text-rose'
        }`}>
          {saveMsg.text}
        </div>
      )}

      {/* Word grid */}
      {displayedWords.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-[40px] mb-3" aria-hidden>📭</div>
          <p className="text-[15px] text-muted">{t('no_vocabulary')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedWords.map(word => (
            <VocabularyCard
              key={word.id}
              word={word}
              progress={progressMap[word.id]}
              isLoggedIn={isLoggedIn}
              onAction={handleAction}
              loginMessage={t('login_to_save')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
