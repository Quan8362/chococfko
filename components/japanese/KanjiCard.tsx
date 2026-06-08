import JlptBadge from './JlptBadge'

export interface KanjiMeaning {
  vi: string
  en: string
}

export interface KanjiExample {
  word: string
  reading: string
  vi: string
  en: string
}

export interface JapaneseKanji {
  id: string
  character: string
  jlpt_level: string | null
  onyomi: string[] | null
  kunyomi: string[] | null
  meanings: KanjiMeaning[] | null
  stroke_count: number | null
  radical: string | null
  examples: KanjiExample[] | null
  tags: string[] | null
}

interface KanjiCardProps {
  kanji: JapaneseKanji
  locale: string
  labels: {
    onyomi: string
    kunyomi: string
    stroke_count: string
    radical: string
    example_words: string
  }
  actionSlot?: React.ReactNode
}

export default function KanjiCard({ kanji, locale, labels, actionSlot }: KanjiCardProps) {
  const meaning = kanji.meanings?.[0]
  const meaningText = locale === 'en' ? meaning?.en : meaning?.vi

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 flex flex-col gap-4 hover:border-rose/25 hover:shadow-[0_4px_16px_-6px_rgba(194,24,91,0.12)] transition-all">

      {/* Header: kanji + badge */}
      <div className="flex items-start justify-between gap-3">
        <span
          lang="ja"
          className="text-[72px] sm:text-[80px] font-bold text-ink leading-none select-all"
          style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
        >
          {kanji.character}
        </span>
        <div className="flex items-center gap-1.5 mt-1">
          {kanji.jlpt_level && <JlptBadge level={kanji.jlpt_level} />}
          {actionSlot}
        </div>
      </div>

      {/* Meaning */}
      {meaningText && (
        <p className="text-[14px] font-semibold text-ink leading-snug">{meaningText}</p>
      )}

      {/* Reading rows */}
      <div className="flex flex-col gap-1.5">
        {kanji.onyomi && kanji.onyomi.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-bold text-muted uppercase tracking-wide shrink-0 w-[52px]">
              {labels.onyomi}
            </span>
            <span lang="ja" className="text-[13px] text-ink font-medium">
              {kanji.onyomi.join('・')}
            </span>
          </div>
        )}
        {kanji.kunyomi && kanji.kunyomi.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-bold text-muted uppercase tracking-wide shrink-0 w-[52px]">
              {labels.kunyomi}
            </span>
            <span lang="ja" className="text-[13px] text-ink font-medium">
              {kanji.kunyomi.join('・')}
            </span>
          </div>
        )}
      </div>

      {/* Metadata: stroke count + radical */}
      <div className="flex items-center gap-3 flex-wrap">
        {kanji.stroke_count != null && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted bg-cream px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z"/>
            </svg>
            {labels.stroke_count}: {kanji.stroke_count}
          </span>
        )}
        {kanji.radical && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted bg-cream px-2 py-0.5 rounded-full">
            <span lang="ja">{labels.radical}: {kanji.radical}</span>
          </span>
        )}
      </div>

      {/* Examples */}
      {kanji.examples && kanji.examples.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-2">
            {labels.example_words}
          </p>
          <div className="flex flex-col gap-2">
            {kanji.examples.slice(0, 2).map((ex, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span lang="ja" className="text-[15px] font-bold text-ink">{ex.word}</span>
                  <span lang="ja" className="text-[11.5px] text-muted">（{ex.reading}）</span>
                </div>
                <p className="text-[12.5px] text-muted">
                  {locale === 'en' ? ex.en : ex.vi}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
