import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel } from '@/components/japanese/LevelPicker'
import { JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import { fetchUserProgress, type ProgressMap } from '@/app/tieng-nhat/actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'
import FlashcardClient from './FlashcardClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('flashcard_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

const WORDS_PER_LEVEL_LIMIT = 200

async function getWordsForLevel(level: string): Promise<JapaneseWord[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('japanese_words')
    .select('id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency')
    .eq('jlpt_level', level)
    .eq('is_published', true)
    .order('frequency', { ascending: false })
    .limit(WORDS_PER_LEVEL_LIMIT)
  return (data as JapaneseWord[]) ?? []
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
  searchParams: { level?: string }
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

  if (validLevel) {
    words = await getWordsForLevel(validLevel)
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
        selectedLevel={rawLevel || null}
        levelCounts={levelCounts}
      />
    </div>
  )
}
