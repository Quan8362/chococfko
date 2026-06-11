import JlptBadge from './JlptBadge'
import KanjiStrokeWriter from './KanjiStrokeWriter'
import type { JapaneseKanji } from './KanjiCard'

interface KanjiPracticeCardProps {
  char: string
  kanji: JapaneseKanji | null
  locale: string
  labels: {
    onyomi: string
    kunyomi: string
    stroke_count: string
    han_viet: string
  }
  noStrokeText: string
}

function ReadingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] font-bold text-muted uppercase tracking-wide shrink-0 w-[40px]">
        {label}
      </span>
      <span lang="ja" className="text-[12px] text-ink font-medium break-words min-w-0">
        {value}
      </span>
    </div>
  )
}

const WRITER_SIZE = 96

export default function KanjiPracticeCard({ char, kanji, locale, labels, noStrokeText }: KanjiPracticeCardProps) {
  const meaning = kanji?.meanings?.[0]
  const meaningText = (locale === 'en' ? meaning?.en : meaning?.vi) || meaning?.en || meaning?.vi

  const noDataFallback = (
    <div
      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-line bg-cream/40 text-center px-2"
      style={{ width: WRITER_SIZE, minHeight: WRITER_SIZE }}
    >
      <span
        lang="ja"
        className="text-[40px] font-bold text-ink leading-none select-all"
        style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
      >
        {char}
      </span>
      <p className="text-[9px] text-muted leading-tight">{noStrokeText}</p>
    </div>
  )

  return (
    <div className="flex gap-3.5 py-4 first:pt-1 last:pb-1">
      {/* Stroke order animation + writing practice */}
      <div className="shrink-0">
        <KanjiStrokeWriter char={char} size={WRITER_SIZE} noDataFallback={noDataFallback} />
      </div>

      {/* Metadata */}
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
            <span lang="ja" className="text-[19px] font-bold text-ink leading-none">
              {char}
            </span>
            {kanji?.han_viet && (
              <span className="text-[10.5px] font-bold text-rose uppercase tracking-wide">
                {labels.han_viet}: {kanji.han_viet}
              </span>
            )}
          </div>
          {kanji?.jlpt_level && <JlptBadge level={kanji.jlpt_level} />}
        </div>

        {meaningText && (
          <p className="text-[12.5px] text-ink leading-snug">{meaningText}</p>
        )}

        {kanji?.onyomi && kanji.onyomi.length > 0 && (
          <ReadingRow label={labels.onyomi} value={kanji.onyomi.join('・')} />
        )}
        {kanji?.kunyomi && kanji.kunyomi.length > 0 && (
          <ReadingRow label={labels.kunyomi} value={kanji.kunyomi.join('・')} />
        )}

        {kanji?.stroke_count != null && (
          <span className="inline-flex items-center self-start text-[10.5px] text-muted bg-cream px-2 py-0.5 rounded-full">
            {labels.stroke_count}: {kanji.stroke_count}
          </span>
        )}
      </div>
    </div>
  )
}
