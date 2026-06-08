import JlptBadge from './JlptBadge'

export type JapaneseWord = {
  id: string
  word: string
  reading: string | null
  romaji: string | null
  jlpt_level: string | null
  pos: string[] | null
  meanings: { vi: string; en: string }[] | null
  examples: { ja: string; reading: string; vi: string; en: string }[] | null
  tags: string[] | null
  frequency: number
}

interface WordCardProps {
  word: JapaneseWord
  locale?: string
  actionSlot?: React.ReactNode
  footerSlot?: React.ReactNode
}

const POS_LABEL: Record<string, string> = {
  verb: 'V.',
  noun: 'N.',
  adjective: 'Adj.',
  adverb: 'Adv.',
}

export default function WordCard({ word, locale = 'vi', actionSlot, footerSlot }: WordCardProps) {
  const firstMeaning = word.meanings?.[0]
  const firstExample = word.examples?.[0]
  const posLabel = word.pos?.map(p => POS_LABEL[p] ?? p).join(' ') ?? ''

  return (
    <div className="bg-paper border border-line rounded-2xl p-4 hover:border-rose/30 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.12)] transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {/* Japanese word — large, clear */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[24px] font-bold text-ink leading-none" lang="ja">
              {word.word}
            </span>
            {word.reading && word.reading !== word.word && (
              <span className="text-[13px] text-muted" lang="ja">
                {word.reading}
              </span>
            )}
          </div>
          {/* Romaji */}
          {word.romaji && (
            <div className="text-[12px] text-muted mt-0.5">{word.romaji}</div>
          )}
        </div>
        {/* Badges + action */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {posLabel && (
            <span className="text-[10px] font-semibold text-muted/80 bg-cream border border-line px-1.5 py-0.5 rounded-full">
              {posLabel}
            </span>
          )}
          {word.jlpt_level && <JlptBadge level={word.jlpt_level} />}
          {actionSlot}
        </div>
      </div>

      {/* Meanings */}
      {firstMeaning && (
        <div className="mt-2 space-y-0.5">
          {locale === 'en' ? (
            <>
              {firstMeaning.en && (
                <p className="text-[14px] text-ink font-medium leading-snug">🇬🇧 {firstMeaning.en}</p>
              )}
              {firstMeaning.vi && (
                <p className="text-[12.5px] text-muted leading-snug">🇻🇳 {firstMeaning.vi}</p>
              )}
            </>
          ) : (
            <>
              {firstMeaning.vi && (
                <p className="text-[14px] text-ink font-medium leading-snug">🇻🇳 {firstMeaning.vi}</p>
              )}
              {firstMeaning.en && (
                <p className="text-[12.5px] text-muted leading-snug">🇬🇧 {firstMeaning.en}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* First example */}
      {firstExample && (
        <div className="mt-3 pt-3 border-t border-line/60">
          <p className="text-[13px] font-medium text-ink" lang="ja">
            {firstExample.ja}
          </p>
          {firstExample.reading && (
            <p className="text-[11.5px] text-muted mt-0.5" lang="ja">
              {firstExample.reading}
            </p>
          )}
          {locale === 'vi' && firstExample.vi && (
            <p className="text-[12px] text-muted/80 mt-0.5 italic">{firstExample.vi}</p>
          )}
          {locale === 'en' && firstExample.en && (
            <p className="text-[12px] text-muted/80 mt-0.5 italic">{firstExample.en}</p>
          )}
        </div>
      )}

      {footerSlot && footerSlot}
    </div>
  )
}
