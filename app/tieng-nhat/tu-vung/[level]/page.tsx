import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel, urlLevel } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import VocabularyClient from './VocabularyClient'
import { fetchUserProgress } from '@/app/tieng-nhat/actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { level: string } }) {
  const level = dbLevel(params.level)
  if (!level) return {}
  const t = await getTranslations('japanese')
  return { title: `${level} ${t('vocab_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
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

interface Props {
  params: { level: string }
}

export default async function VocabularyLevelPage({ params }: Props) {
  const level = dbLevel(params.level)
  if (!level) notFound()

  const [t, supabase] = await Promise.all([
    getTranslations('japanese'),
    Promise.resolve(createClient()),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  const words = await getWordsForLevel(level)
  const wordIds = words.map(w => w.id)
  const initialProgress = await fetchUserProgress(wordIds)

  const levelDescs: Record<string, string> = {
    N5: t('n5_desc'),
    N4: t('n4_desc'),
    N3: t('n3_desc'),
    N2: t('n2_desc'),
    N1: t('n1_desc'),
  }

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <Link href="/tieng-nhat/tu-vung" className="hover:text-rose transition-colors">
          {t('vocab_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink font-semibold">{level}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] text-ink leading-tight">
              {level}
            </h1>
            <JlptBadge level={level} />
          </div>
          <p className="text-[14px] text-muted">{levelDescs[level]}</p>
        </div>
        {/* Level nav */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['N5', 'N4', 'N3', 'N2', 'N1'] as const).map(l => (
            <Link
              key={l}
              href={`/tieng-nhat/tu-vung/${urlLevel(l)}`}
              className={`text-[12px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                l === level
                  ? 'bg-rose text-white'
                  : 'bg-cream text-muted hover:text-ink hover:bg-line'
              }`}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      {/* Vocabulary client — search, filter, cards */}
      <VocabularyClient
        words={words}
        initialProgress={initialProgress}
        isLoggedIn={!!user}
        level={urlLevel(level)}
      />
    </div>
  )
}
