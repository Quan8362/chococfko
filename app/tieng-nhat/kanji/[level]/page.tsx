import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel, urlLevel, JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import type { JapaneseKanji } from '@/components/japanese/KanjiCard'
import KanjiClient from './KanjiClient'
import { getBookmarkIds } from '../../bookmark-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { level: string } }) {
  const level = dbLevel(params.level)
  if (!level) return {}
  const t = await getTranslations('japanese')
  return { title: `${level} ${t('kanji_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

const KANJI_PER_LEVEL_LIMIT = 200

async function getKanjiForLevel(level: string): Promise<JapaneseKanji[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('japanese_kanji')
    .select('id,character,jlpt_level,onyomi,kunyomi,meanings,stroke_count,radical,examples,tags')
    .eq('jlpt_level', level)
    .eq('is_published', true)
    .order('stroke_count', { ascending: true })
    .limit(KANJI_PER_LEVEL_LIMIT)
  return (data as JapaneseKanji[]) ?? []
}

interface Props {
  params: { level: string }
}

export default async function KanjiLevelPage({ params }: Props) {
  const level = dbLevel(params.level)
  if (!level) notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [t, kanji, initialBookmarkedKanjiIds] = await Promise.all([
    getTranslations('japanese'),
    getKanjiForLevel(level),
    user ? getBookmarkIds('kanji') : Promise.resolve([] as string[]),
  ])

  const levelDescs: Record<string, string> = {
    N5: t('n5_desc'),
    N4: t('n4_desc'),
    N3: t('n3_desc'),
    N2: t('n2_desc'),
    N1: t('n1_desc'),
  }

  return (
    <div className="max-w-[1080px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <Link href="/tieng-nhat/kanji" className="hover:text-rose transition-colors">
          {t('kanji_heading')}
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
          <p className="text-[13px] text-muted mt-1">
            {t('kanji_count', { count: kanji.length })}
          </p>
        </div>
        {/* Level switcher */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {JLPT_LEVELS.map(l => (
            <Link
              key={l}
              href={`/tieng-nhat/kanji/${urlLevel(l)}`}
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

      <KanjiClient
        kanji={kanji}
        isLoggedIn={!!user}
        initialBookmarkedKanjiIds={initialBookmarkedKanjiIds}
      />
    </div>
  )
}
