import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import LevelPicker, { JLPT_LEVELS, urlLevel } from '@/components/japanese/LevelPicker'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return {
    title: `${t('grammar_heading')} · ${t('page_heading')}`,
    alternates: { canonical: 'https://chococfko.com/japanese/grammar' },
  }
}

async function getLevelCounts(): Promise<Record<string, number>> {
  const supabase = createClient()
  const counts: Record<string, number> = {}
  await Promise.all(
    JLPT_LEVELS.map(async level => {
      const { count } = await supabase
        .from('japanese_grammar')
        .select('id', { count: 'exact', head: true })
        .eq('jlpt_level', level)
        .eq('is_published', true)
      counts[level] = count ?? 0
    })
  )
  return counts
}

export default async function GrammarHubPage() {
  const [t, counts] = await Promise.all([
    getTranslations('japanese'),
    getLevelCounts(),
  ])

  const levelDescs: Record<string, string> = {
    N5: t('n5_desc'),
    N4: t('n4_desc'),
    N3: t('n3_desc'),
    N2: t('n2_desc'),
    N1: t('n1_desc'),
  }

  const levels = JLPT_LEVELS.map(level => ({
    level,
    desc:         levelDescs[level],
    count:        counts[level] ?? 0,
    href:         `/japanese/grammar/${urlLevel(level)}`,
    label:        t('study_grammar'),
    countDisplay: counts[level] ? t('grammar_count', { count: counts[level] }) : undefined,
  }))

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/japanese" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('grammar_heading')}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          ✏️ {t('grammar_heading')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('grammar_heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('grammar_desc')}</p>
      </div>

      <LevelPicker levels={levels} />
    </div>
  )
}
