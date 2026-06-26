import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel } from '@/components/japanese/LevelPicker'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import { fetchUserProgress, fetchAllUserProgress, type ProgressMap } from '@/app/japanese/actions'
import { getWordsForDeck, getWordIdsForLevel, FLASHCARD_DECK_SIZE, FLASHCARD_EXCLUDE_TAG } from '@/lib/japanese/words'
import type { JapaneseWord } from '@/components/japanese/WordCard'
import FlashcardClient, { type DeckStat } from './FlashcardClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('flashcard_heading')} · ${t('page_heading')}` }
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
        .or(`tags.is.null,tags.not.cs.{${FLASHCARD_EXCLUDE_TAG}}`)
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

  // Per-deck learning progress for the set-selection grid (real DB progress from
  // jp_flashcard_progress, aggregated per deck). Only computed in deck-picker mode.
  let deckStats: DeckStat[] = []

  if (validLevel && selectedDeck) {
    words = await getWordsForDeck(validLevel, selectedDeck)
    initialProgress = await fetchUserProgress(words.map(w => w.id))
  } else if (validLevel) {
    const [ids, progress] = await Promise.all([
      getWordIdsForLevel(validLevel),
      fetchAllUserProgress(),
    ])
    deckStats = Array.from({ length: totalDecks }, (_, i) => {
      const deck = i + 1
      const slice = ids.slice(i * FLASHCARD_DECK_SIZE, deck * FLASHCARD_DECK_SIZE)
      const from = i * FLASHCARD_DECK_SIZE + 1
      const size = slice.length
      let mastered = 0
      for (const id of slice) if (progress[id] === 'mastered') mastered++
      return { deck, from, to: from + Math.max(size, 1) - 1, size, mastered }
    })
  }

  // Deck-picker mode gets a wider canvas so set cards can flow into 4 columns and
  // fill the wide side margins; every other mode stays in the narrow reading column.
  const isDeckPicker = !!validLevel && !selectedDeck

  return (
    <div className={`${isDeckPicker ? 'max-w-[1120px]' : 'max-w-[700px]'} mx-auto px-5 sm:px-6 py-10 pb-20`}>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/japanese" className="hover:text-rose transition-colors">
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
        deckStats={deckStats}
      />
    </div>
  )
}
