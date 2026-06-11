import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { extractKanji } from '@/lib/japanese/kanji'
import KanjiCard, { type JapaneseKanji } from './KanjiCard'

interface KanjiPracticeSectionProps {
  /** The Japanese vocabulary word to extract Kanji from. */
  word: string
  className?: string
}

export default async function KanjiPracticeSection({ word, className = '' }: KanjiPracticeSectionProps) {
  const chars = extractKanji(word)
  // Hide the whole section if the word has no Kanji (e.g. pure kana words).
  if (chars.length === 0) return null

  const [t, locale] = await Promise.all([
    getTranslations('japanese'),
    getLocale(),
  ])

  const supabase = createClient()
  const { data } = await supabase
    .from('japanese_kanji')
    .select('id,character,jlpt_level,onyomi,kunyomi,meanings,stroke_count,radical,examples,tags')
    .in('character', chars)
    .eq('is_published', true)

  const byChar = new Map<string, JapaneseKanji>(
    ((data as JapaneseKanji[] | null) ?? []).map(k => [k.character, k]),
  )

  const labels = {
    onyomi: t('onyomi'),
    kunyomi: t('kunyomi'),
    stroke_count: t('stroke_count'),
    radical: t('radical'),
    example_words: t('example_words'),
  }

  return (
    <section className={className}>
      <h2 className="font-serif font-bold text-[17px] text-ink mb-4">
        {t('kanji_practice_title')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {chars.map(ch => {
          const kanji = byChar.get(ch)
          if (kanji) {
            return <KanjiCard key={ch} kanji={kanji} locale={locale} labels={labels} />
          }
          // No DB record / no stroke data for this Kanji yet — clean fallback card.
          return (
            <div
              key={ch}
              className="bg-paper border border-line rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-center min-h-[160px]"
            >
              <span
                lang="ja"
                className="text-[72px] font-bold text-ink leading-none select-all"
                style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
              >
                {ch}
              </span>
              <p className="text-[12.5px] text-muted leading-snug">
                {t('kanji_practice_no_stroke')}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
