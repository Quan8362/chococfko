import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel } from '@/components/japanese/LevelPicker'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import { fetchUserProgress, type ProgressMap } from '@/app/tieng-nhat/actions'
import { getWordsForDeck, FLASHCARD_DECK_SIZE } from '@/lib/japanese/words'
import type { JapaneseWord } from '@/components/japanese/WordCard'
import FlashcardClient from './FlashcardClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('flashcard_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

async function getLevelCounts(): Promise<Record<string, number>> {
  const supabase = createClient()
  const counts: Record<string, number> = {}
  await Promise.all(
    JLPT_LEVELS.map(async level => {
      const { count } = await supabase
        .from('japanese_words')
        .select('id', { count: 'exact', head: true })
        .eq('jlpt_level', level)
        .eq('is_published', true)
      counts[level] = count ?? 0
    })
  )
  return counts
}

interface Props {
  searchParams: { level?: string; set?: string }
}

export default async function FlashcardPage({ searchParams }: Props) {
  const t = await getTranslations('japanese')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const rawLevel = searchParams.level ?? ''
  const validLevel = rawLevel ? dbLevel(rawLevel) : null

  let words: JapaneseWord[] = []
  let initialProgress: ProgressMap = {}
  const levelCounts = await getLevelCounts()

  // A deck (set) is only loaded once the user has picked both a level and a set.
  const totalDecks = validLevel
    ? Math.max(1, Math.ceil((levelCounts[validLevel] ?? 0) / FLASHCARD_DECK_SIZE))
    : 0
  const rawSet = Number(searchParams.set)
  const selectedDeck =
    validLevel && Number.isInteger(rawSet) && rawSet >= 1 && rawSet <= totalDecks
      ? rawSet
      : null

  if (validLevel && selectedDeck) {
    words = await getWordsForDeck(validLevel, selectedDeck)
    initialProgress = await fetchUserProgress(words.map(w => w.id))
  }

  return (
    <div className="max-w-[700px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('flashcard_heading')}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          🃏 {t('flashcard_heading')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('flashcard_heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('flashcard_desc')}</p>
      </div>

      <FlashcardClient
        words={words}
        initialProgress={initialProgress}
        isLoggedIn={!!user}
        selectedLevel={validLevel ? rawLevel : null}
        levelCounts={levelCounts}
        deckSize={FLASHCARD_DECK_SIZE}
        totalDecks={totalDecks}
        selectedDeck={selectedDeck}
      />
    </div>
  )
}
