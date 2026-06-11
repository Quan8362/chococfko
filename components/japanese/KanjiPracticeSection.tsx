import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { extractKanji } from '@/lib/japanese/kanji'
import type { JapaneseKanji } from './KanjiCard'
import KanjiPracticeCard from './KanjiPracticeCard'

interface KanjiPracticeSectionProps {
  /** The Japanese vocabulary word to extract Kanji from. */
  word: string
  className?: string
}

const SELECT_BASE = 'id,character,jlpt_level,onyomi,kunyomi,meanings,stroke_count,radical,examples,tags'
const SELECT_FULL = `${SELECT_BASE},han_viet`

export default async function KanjiPracticeSection({ word, className = '' }: KanjiPracticeSectionProps) {
  const chars = extractKanji(word)
  // Hide the whole section if the word has no Kanji (e.g. pure kana words).
  if (chars.length === 0) return null

  const [t, locale] = await Promise.all([
    getTranslations('japanese'),
    getLocale(),
  ])

  const supabase = createClient()

  // Try selecting han_viet; fall back gracefully if the column hasn't been
  // migrated yet so the page never breaks.
  const full = await supabase
    .from('japanese_kanji')
    .select(SELECT_FULL)
    .in('character', chars)
    .eq('is_published', true)

  let data = full.data as JapaneseKanji[] | null
  if (full.error) {
    const base = await supabase
      .from('japanese_kanji')
      .select(SELECT_BASE)
      .in('character', chars)
      .eq('is_published', true)
    data = base.data as JapaneseKanji[] | null
  }

  const byChar = new Map<string, JapaneseKanji>(
    (data ?? []).map(k => [k.character, k]),
  )

  const labels = {
    onyomi: t('onyomi'),
    kunyomi: t('kunyomi'),
    stroke_count: t('stroke_count'),
    han_viet: t('kanji_practice_hanviet'),
  }
  const noStrokeText = t('kanji_practice_no_stroke')

  return (
    <section className={className}>
      <h2 className="font-serif font-bold text-[17px] text-ink mb-4">
        {t('kanji_practice_title')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {chars.map(ch => (
          <KanjiPracticeCard
            key={ch}
            char={ch}
            kanji={byChar.get(ch) ?? null}
            locale={locale}
            labels={labels}
            noStrokeText={noStrokeText}
          />
        ))}
      </div>
    </section>
  )
}
