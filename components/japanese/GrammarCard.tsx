import JlptBadge from './JlptBadge'

export interface GrammarExample {
  ja: string
  reading: string
  vi: string
  en: string
}

export interface JapaneseGrammar {
  id: string
  pattern: string
  jlpt_level: string | null
  meaning_vi: string | null
  meaning_en: string | null
  structure: string | null
  notes: string | null
  examples: GrammarExample[] | null
  tags: string[] | null
}

interface GrammarCardProps {
  grammar: JapaneseGrammar
  locale: string
  labels: {
    structure: string
    notes: string
  }
  actionSlot?: React.ReactNode
}

export default function GrammarCard({ grammar, locale, labels, actionSlot }: GrammarCardProps) {
  const meaning = locale === 'en' ? grammar.meaning_en : grammar.meaning_vi
  const example = grammar.examples?.[0]

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3 hover:border-rose/25 hover:shadow-[0_4px_16px_-6px_rgba(194,24,91,0.12)] transition-all">

      {/* Header: pattern + badge */}
      <div className="flex items-start justify-between gap-3">
        <span
          lang="ja"
          className="text-[20px] sm:text-[22px] font-bold text-rose leading-snug"
          style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
        >
          {grammar.pattern}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {grammar.jlpt_level && <JlptBadge level={grammar.jlpt_level} />}
          {actionSlot}
        </div>
      </div>

      {/* Meaning */}
      {meaning && (
        <p className="text-[14px] font-semibold text-ink leading-snug">{meaning}</p>
      )}

      {/* Structure */}
      {grammar.structure && (
        <div>
          <span className="text-[10.5px] font-bold text-muted uppercase tracking-wide block mb-1">
            {labels.structure}
          </span>
          <code
            lang="ja"
            className="block text-[12.5px] text-ink bg-cream border border-line rounded-lg px-3 py-2 leading-relaxed"
            style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            {grammar.structure}
          </code>
        </div>
      )}

      {/* Notes */}
      {grammar.notes && (
        <div className="flex gap-2">
          <span className="text-[10.5px] font-bold text-muted uppercase tracking-wide shrink-0 pt-0.5">
            {labels.notes}:
          </span>
          <p className="text-[12.5px] text-muted leading-relaxed">{grammar.notes}</p>
        </div>
      )}

      {/* Example */}
      {example && (
        <div className="border-t border-line pt-3 flex flex-col gap-1.5">
          <p lang="ja" className="text-[14px] text-ink font-medium leading-relaxed">
            {example.ja}
          </p>
          <p lang="ja" className="text-[11.5px] text-muted">{example.reading}</p>
          <p className="text-[12.5px] text-muted italic">
            {locale === 'en' ? example.en : example.vi}
          </p>
        </div>
      )}
    </div>
  )
}
