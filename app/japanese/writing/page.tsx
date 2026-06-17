import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { JLPT_LEVELS, urlLevel } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import TapVietLevelPicker, { JoyoBadge, type WorkbookLevelInfo } from '@/components/japanese/workbook/TapVietLevelPicker'
import { JOYO_KEYS, joyoUrl, joyoDbValue, type JoyoKey } from '@/lib/japanese/joyo'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('writing_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

async function getJlptCounts(): Promise<Record<string, number>> {
  const supabase = createClient()
  const counts: Record<string, number> = {}
  await Promise.all(
    JLPT_LEVELS.map(async level => {
      const { count } = await supabase
        .from('japanese_kanji')
        .select('id', { count: 'exact', head: true })
        .eq('jlpt_level', level)
        .eq('is_published', true)
      counts[level] = count ?? 0
    })
  )
  return counts
}

async function getJoyoCounts(): Promise<Record<string, number>> {
  const supabase = createClient()
  const counts: Record<string, number> = {}
  await Promise.all(
    JOYO_KEYS.map(async key => {
      const { count } = await supabase
        .from('japanese_kanji')
        .select('id', { count: 'exact', head: true })
        .eq('joyo_grade', joyoDbValue(key))
        .eq('is_published', true)
      counts[key] = count ?? 0
    })
  )
  return counts
}

export default async function TapVietHubPage() {
  const [t, jlptCounts, joyoCounts] = await Promise.all([
    getTranslations('japanese'),
    getJlptCounts(),
    getJoyoCounts().catch(() => ({} as Record<string, number>)), // joyo_grade column may not exist yet
  ])

  const levelDescs: Record<string, string> = {
    N5: t('n5_desc'), N4: t('n4_desc'), N3: t('n3_desc'), N2: t('n2_desc'), N1: t('n1_desc'),
  }

  const jlptLevels: WorkbookLevelInfo[] = JLPT_LEVELS.map(level => ({
    key: urlLevel(level),
    badge: <JlptBadge level={level} />,
    title: level,
    desc: levelDescs[level],
    count: jlptCounts[level] ?? 0,
    totalPages: Math.ceil((jlptCounts[level] ?? 0) / PAGE_SIZE),
    href: `/japanese/writing/${urlLevel(level)}`,
  }))

  const joyoLabel = (key: JoyoKey) =>
    key === 's' ? t('writing_joyo_secondary') : t('writing_joyo_grade', { grade: key })
  const joyoBadgeLabel = (key: JoyoKey) =>
    key === 's' ? t('writing_joyo_badge_secondary') : t('writing_joyo_grade', { grade: key })
  const joyoDesc = (key: JoyoKey) =>
    key === 's' ? t('writing_joyo_secondary_desc') : t('writing_joyo_grade_desc', { grade: key })

  const joyoLevels: WorkbookLevelInfo[] = JOYO_KEYS.map(key => ({
    key: joyoUrl(key),
    badge: <JoyoBadge label={joyoBadgeLabel(key)} />,
    title: joyoLabel(key),
    desc: joyoDesc(key),
    count: joyoCounts[key] ?? 0,
    totalPages: Math.ceil((joyoCounts[key] ?? 0) / PAGE_SIZE),
    href: `/japanese/writing/${joyoUrl(key)}`,
  }))

  const hasJoyo = joyoLevels.some(l => l.count > 0)

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/japanese" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('writing_heading')}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          ✍️ {t('writing_heading')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('writing_heading')}
        </h1>
        <p className="text-[14px] text-muted max-w-[560px]">{t('writing_desc')}</p>
      </div>

      {/* JLPT section */}
      <h2 className="font-serif font-bold text-[18px] text-ink mb-1">{t('writing_jlpt_section')}</h2>
      <p className="text-[13px] text-muted mb-4">{t('page_desc')}</p>
      <TapVietLevelPicker levels={jlptLevels} />

      {/* Jōyō section */}
      {hasJoyo && (
        <div className="mt-12">
          <h2 className="font-serif font-bold text-[18px] text-ink mb-1">{t('writing_joyo_section')}</h2>
          <p className="text-[13px] text-muted mb-4">{t('writing_joyo_desc')}</p>
          <TapVietLevelPicker levels={joyoLevels} />
        </div>
      )}
    </div>
  )
}
