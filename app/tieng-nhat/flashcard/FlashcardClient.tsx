'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import FlashcardViewer from '@/components/japanese/FlashcardViewer'
import LevelPicker, { JLPT_LEVELS, urlLevel } from '@/components/japanese/LevelPicker'
import { saveWordProgress, type ProgressAction, type ProgressMap } from '@/app/tieng-nhat/actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'

interface FlashcardClientProps {
  words: JapaneseWord[]
  initialProgress: ProgressMap
  isLoggedIn: boolean
  selectedLevel: string | null
  levelCounts: Record<string, number>
}

export default function FlashcardClient({
  words,
  isLoggedIn,
  selectedLevel,
  levelCounts,
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
      href: `/tieng-nhat/flashcard?level=${urlLevel(level)}`,
      label: t('study_flashcard'),
    }))

    return (
      <div>
        <p className="text-[14px] text-muted mb-8">{t('flashcard_select_level')}</p>
        <LevelPicker levels={levels} />
      </div>
    )
  }

  /* ── Active flashcard session ── */
  const levelUpper = selectedLevel.toUpperCase()

  return (
    <div>
      {/* Back link */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href={`/tieng-nhat/tu-vung/${selectedLevel}`}
          className="text-[12.5px] text-muted hover:text-rose transition-colors"
        >
          ← {t('back_to_vocab')}
        </Link>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">
          {levelUpper}
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
