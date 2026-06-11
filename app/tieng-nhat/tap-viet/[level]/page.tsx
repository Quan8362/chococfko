import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dbLevel, urlLevel, JLPT_LEVELS } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import { JoyoBadge } from '@/components/japanese/workbook/TapVietLevelPicker'
import { JOYO_KEYS, joyoUrl, joyoDbValue, parseJoyoParam, type JoyoKey } from '@/lib/japanese/joyo'
import { cleanMeaningText } from '@/lib/sanitize'
import WorkbookClient from './WorkbookClient'
import type { WorkbookKanji } from '@/components/japanese/workbook/WorkbookRow'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10
const FETCH_CHUNK = 1000
const MAX_KANJI = 2500

interface KanjiRow {
  character: string
  han_viet: string | null
  meanings: { vi: string; en: string }[] | null
  onyomi: string[] | null
  kunyomi: string[] | null
  stroke_count: number | null
}

/** Resolve the route param to either a JLPT level or a Jōyō grade. */
function resolveTrack(param: string):
  | { type: 'jlpt'; level: string }
  | { type: 'joyo'; key: JoyoKey }
  | null {
  const jlpt = dbLevel(param)
  if (jlpt) return { type: 'jlpt', level: jlpt }
  const joyo = parseJoyoParam(param)
  if (joyo) return { type: 'joyo', key: joyo }
  return null
}

async function getKanji(column: 'jlpt_level' | 'joyo_grade', value: string | number): Promise<KanjiRow[]> {
  const supabase = createClient()
  const all: KanjiRow[] = []
  // Supabase caps a single response at ~1000 rows; page through (N1 / secondary are large).
  for (let from = 0; from < MAX_KANJI; from += FETCH_CHUNK) {
    const { data } = await supabase
      .from('japanese_kanji')
      .select('character,han_viet,meanings,onyomi,kunyomi,stroke_count')
      .eq(column, value)
      .eq('is_published', true)
      .order('stroke_count', { ascending: true })
      .order('character', { ascending: true })
      .range(from, from + FETCH_CHUNK - 1)
    const batch = (data as KanjiRow[]) ?? []
    all.push(...batch)
    if (batch.length < FETCH_CHUNK) break
  }
  return all
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function generateMetadata({ params }: { params: { level: string } }) {
  const track = resolveTrack(params.level)
  if (!track) return {}
  const t = await getTranslations('japanese')
  const label = track.type === 'jlpt'
    ? track.level
    : track.key === 's' ? t('writing_joyo_secondary_full') : t('writing_joyo_grade_full', { grade: track.key })
  return { title: `${label} · ${t('writing_heading')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

interface Props {
  params: { level: string }
}

export default async function TapVietLevelPage({ params }: Props) {
  const track = resolveTrack(params.level)
  if (!track) notFound()

  const [t, locale, rows] = await Promise.all([
    getTranslations('japanese'),
    getLocale(),
    track.type === 'jlpt'
      ? getKanji('jlpt_level', track.level)
      : getKanji('joyo_grade', joyoDbValue(track.key)),
  ])

  const items: WorkbookKanji[] = rows.map(r => {
    const m = r.meanings?.[0]
    const raw = (locale === 'en' ? m?.en : m?.vi) || m?.vi || m?.en || ''
    return {
      character: r.character,
      han_viet: r.han_viet ?? null,
      meaning: raw ? cleanMeaningText(raw) : null,
      onyomi: r.onyomi ?? null,
      kunyomi: r.kunyomi ?? null,
      stroke_count: r.stroke_count ?? null,
    }
  })

  const pages = chunk(items, PAGE_SIZE)

  const levelDescs: Record<string, string> = {
    N5: t('n5_desc'), N4: t('n4_desc'), N3: t('n3_desc'), N2: t('n2_desc'), N1: t('n1_desc'),
  }

  const isJlpt = track.type === 'jlpt'
  const title = isJlpt
    ? track.level
    : track.key === 's' ? t('writing_joyo_secondary_full') : t('writing_joyo_grade_full', { grade: track.key })
  const desc = isJlpt
    ? levelDescs[track.level]
    : track.key === 's' ? t('writing_joyo_secondary_desc') : t('writing_joyo_grade_desc', { grade: track.key })
  const sectionLabel = isJlpt ? t('writing_jlpt_section') : t('writing_joyo_section')

  return (
    <div className="max-w-[1080px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap print:hidden">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <Link href="/tieng-nhat/tap-viet" className="hover:text-rose transition-colors">
          {t('writing_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink font-semibold">{title}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] text-ink leading-tight">
              {title}
            </h1>
            {isJlpt
              ? <JlptBadge level={track.level} />
              : <JoyoBadge label={track.key === 's' ? t('writing_joyo_badge_secondary') : t('writing_joyo_grade', { grade: track.key })} />}
          </div>
          <p className="text-[13px] text-muted">{sectionLabel}</p>
          <p className="text-[14px] text-muted">{desc}</p>
        </div>
        {/* Track switcher */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isJlpt
            ? JLPT_LEVELS.map(l => (
                <Link
                  key={l}
                  href={`/tieng-nhat/tap-viet/${urlLevel(l)}`}
                  className={`text-[12px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                    l === track.level ? 'bg-rose text-white' : 'bg-cream text-muted hover:text-ink hover:bg-line'
                  }`}
                >
                  {l}
                </Link>
              ))
            : JOYO_KEYS.map(k => (
                <Link
                  key={k}
                  href={`/tieng-nhat/tap-viet/${joyoUrl(k)}`}
                  className={`text-[12px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                    k === track.key ? 'bg-teal text-white' : 'bg-cream text-muted hover:text-ink hover:bg-line'
                  }`}
                >
                  {k === 's' ? t('writing_joyo_badge_secondary') : k}
                </Link>
              ))}
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 text-center text-[14px] text-muted">
          {t('writing_empty')}
        </div>
      ) : (
        <WorkbookClient storageKey={params.level} title={title} pages={pages} />
      )}
    </div>
  )
}
