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
    <div className="flex items-baseline gap-2">
      <span className="text-[10.5px] font-bold text-muted uppercase tracking-wide shrink-0 w-[52px]">
        {label}
      </span>
      <span lang="ja" className="text-[13px] text-ink font-medium">
        {value}
      </span>
    </div>
  )
}

export default function KanjiPracticeCard({ char, kanji, locale, labels, noStrokeText }: KanjiPracticeCardProps) {
  const meaning = kanji?.meanings?.[0]
  const meaningText = (locale === 'en' ? meaning?.en : meaning?.vi) || meaning?.en || meaning?.vi

  const hasInfo =
    !!kanji &&
    (!!kanji.han_viet ||
      !!meaningText ||
      !!kanji.onyomi?.length ||
      !!kanji.kunyomi?.length ||
      kanji.stroke_count != null ||
      !!kanji.jlpt_level)

  const noDataFallback = (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-cream/40 text-center px-3"
      style={{ width: 150, minHeight: 150 }}
    >
      <span
        lang="ja"
        className="text-[56px] font-bold text-ink leading-none select-all"
        style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
      >
        {char}
      </span>
      <p className="text-[11px] text-muted leading-snug">{noStrokeText}</p>
    </div>
  )

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 flex flex-col gap-4 hover:border-rose/25 hover:shadow-[0_4px_16px_-6px_rgba(194,24,91,0.12)] transition-all">
      {/* Stroke order animation + writing practice */}
      <div className="flex justify-center">
        <KanjiStrokeWriter char={char} noDataFallback={noDataFallback} />
      </div>

      {/* Metadata (only when we have data for this Kanji) */}
      {hasInfo && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span lang="ja" className="text-[22px] font-bold text-ink leading-none">
                {char}
              </span>
              {kanji?.han_viet && (
                <span className="text-[12px] font-bold text-rose uppercase tracking-wide">
                  {labels.han_viet}: {kanji.han_viet}
                </span>
              )}
            </div>
            {kanji?.jlpt_level && <JlptBadge level={kanji.jlpt_level} />}
          </div>

          {meaningText && (
            <p className="text-[13.5px] text-ink font-medium leading-snug">{meaningText}</p>
          )}

          <div className="flex flex-col gap-1">
            {kanji?.onyomi && kanji.onyomi.length > 0 && (
              <ReadingRow label={labels.onyomi} value={kanji.onyomi.join('・')} />
            )}
            {kanji?.kunyomi && kanji.kunyomi.length > 0 && (
              <ReadingRow label={labels.kunyomi} value={kanji.kunyomi.join('・')} />
            )}
          </div>

          {kanji?.stroke_count != null && (
            <span className="inline-flex items-center gap-1 self-start text-[11.5px] text-muted bg-cream px-2 py-0.5 rounded-full">
              {labels.stroke_count}: {kanji.stroke_count}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
