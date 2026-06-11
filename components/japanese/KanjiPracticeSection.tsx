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
      <div className="bg-paper border border-line rounded-2xl p-4 sm:p-5 shadow-sm">
        <h2 className="font-serif font-bold text-[15px] text-ink mb-1 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-rose" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {t('kanji_practice_title')}
        </h2>
        <div className="divide-y divide-line/60">
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
      </div>
    </section>
  )
}
