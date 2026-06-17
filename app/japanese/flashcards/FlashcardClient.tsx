'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import FlashcardViewer from '@/components/japanese/FlashcardViewer'
import LevelPicker, { JLPT_LEVELS, urlLevel } from '@/components/japanese/LevelPicker'
import { saveWordProgress, type ProgressAction, type ProgressMap } from '@/app/japanese/actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'

interface FlashcardClientProps {
  words: JapaneseWord[]
  initialProgress: ProgressMap
  isLoggedIn: boolean
  selectedLevel: string | null
  levelCounts: Record<string, number>
  deckSize: number
  totalDecks: number
  selectedDeck: number | null
}

export default function FlashcardClient({
  words,
  isLoggedIn,
  selectedLevel,
  levelCounts,
  deckSize,
  totalDecks,
  selectedDeck,
}: FlashcardClientProps) {
  const t = useTranslations('japanese')

  const handleSave = async (wordId: string, action: ProgressAction) => {
    await saveWordProgress(wordId, action)
  }

  /* ── Level picker (no level selected) ── */
  if (!selectedLevel) {
    const levels = JLPT_LEVELS.map(level => ({
      level,
      desc: t(`${level.toLowerCase()}_desc` as Parameters<typeof t>[0]),
      count: levelCounts[level] ?? 0,
      href: `/japanese/flashcards?level=${urlLevel(level)}`,
      label: t('study_flashcard'),
    }))

    return (
      <div>
        <p className="text-[14px] text-muted mb-8">{t('flashcard_select_level')}</p>
        <LevelPicker levels={levels} />
      </div>
    )
  }

  const levelUpper = selectedLevel.toUpperCase()
  const levelTotal = levelCounts[levelUpper] ?? 0

  /* ── Deck picker (level selected, no deck) ── */
  if (!selectedDeck) {
    const decks = Array.from({ length: totalDecks }, (_, i) => {
      const deck = i + 1
      const from = i * deckSize + 1
      const to = Math.min(deck * deckSize, levelTotal)
      return { deck, from, to }
    })

    return (
      <div>
        {/* Back link */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link
            href="/japanese/flashcards"
            className="text-[12.5px] text-muted hover:text-rose transition-colors"
          >
            ← {t('flashcard_change_level')}
          </Link>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">
            {levelUpper}
          </span>
          <span className="text-[12.5px] text-muted">{t('words_count', { count: levelTotal })}</span>
        </div>

        <p className="text-[14px] text-muted mb-5">{t('flashcard_select_set')}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {decks.map(({ deck, from, to }) => (
            <Link
              key={deck}
              href={`/japanese/flashcards?level=${selectedLevel}&set=${deck}`}
              className="group bg-paper border border-line rounded-2xl p-4 hover:border-rose/40 hover:bg-rose/5 transition-colors"
            >
              <p className="text-[13px] font-bold text-ink group-hover:text-rose transition-colors">
                {t('flashcard_set_n', { n: deck })}
              </p>
              <p className="text-[12px] text-muted mt-0.5">
                {t('flashcard_set_range', { from, to })}
              </p>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  /* ── Active flashcard session ── */
  return (
    <div>
      {/* Back link */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href={`/japanese/flashcards?level=${selectedLevel}`}
          className="text-[12.5px] text-muted hover:text-rose transition-colors"
        >
          ← {t('flashcard_change_set')}
        </Link>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">
          {levelUpper}
        </span>
        <span className="text-[12.5px] text-muted">
          {t('flashcard_set_of', { n: selectedDeck, total: totalDecks })}
        </span>
        <span className="text-[12.5px] text-muted">{t('words_count', { count: words.length })}</span>
      </div>

      <FlashcardViewer
        words={words}
        isLoggedIn={isLoggedIn}
        onSave={handleSave}
        loginMessage={t('login_to_save')}
      />
    </div>
  )
}
