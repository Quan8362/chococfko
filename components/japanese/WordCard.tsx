import JlptBadge from './JlptBadge'
import PosBadges from './PosBadges'
import { cleanMeaningText } from '@/lib/sanitize'
import { displayRomaji } from '@/lib/japanese/romaji'

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
  // Image illustration fields (optional — only selected on detail page)
  image_url?: string | null
  image_alt?: string | null
  image_source?: string | null
  image_credit_url?: string | null
  image_status?: string | null
  image_fetched_at?: string | null
}

interface WordCardProps {
  word: JapaneseWord
  locale?: string
  actionSlot?: React.ReactNode
  footerSlot?: React.ReactNode
}

const NO_VI_MEANING: Record<string, string> = {
  vi: 'Chưa có nghĩa tiếng Việt',
  en: 'Vietnamese meaning not available',
  ja: 'ベトナム語訳なし',
  ko: '베트남어 번역 없음',
  zh: '暂无越南语释义',
}

export default function WordCard({ word, locale = 'vi', actionSlot, footerSlot }: WordCardProps) {
  const firstMeaning = word.meanings?.[0]
  const firstExample = word.examples?.[0]
  const romaji = displayRomaji(word.reading, word.romaji)

  const hasBadges = (word.pos && word.pos.length > 0) || !!word.jlpt_level

  return (
    <div className="group relative flex h-full flex-col cursor-pointer bg-paper border border-line rounded-2xl p-4 hover:border-rose/30 hover:bg-cream/40 hover:shadow-[0_6px_24px_-8px_rgba(194,24,91,0.18)] transition-all">
      {/* Bookmark — pinned top-right so it never competes with the title for width */}
      {actionSlot && (
        <div className="absolute top-3 right-3 z-10">{actionSlot}</div>
      )}

      {/* Row 1 — WORD BLOCK on its own full-width row. The reading sits beside the
          kanji (wrapping to its own line if needed). Right padding reserves space
          for the pinned bookmark. break-normal + line-break:strict guarantee CJK
          never breaks per character. */}
      <div className="pr-9">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-[24px] font-bold text-ink leading-tight break-normal [line-break:strict] [overflow-wrap:normal] group-hover:text-rose transition-colors"
            lang="ja"
          >
            {word.word}
          </span>
          {word.reading && word.reading !== word.word && (
            <span
              className="text-[13px] text-muted break-normal [line-break:strict] [overflow-wrap:normal]"
              lang="ja"
            >
              {word.reading}
            </span>
          )}
        </div>
        {/* Romaji */}
        {romaji && (
          <div className="text-[12px] text-muted mt-0.5">{romaji}</div>
        )}
      </div>

      {/* Row 2 — BADGE ROW beneath the word block, wraps on narrow cards */}
      {hasBadges && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <PosBadges value={word.pos} variant="compact" max={2} />
          {word.jlpt_level && <JlptBadge level={word.jlpt_level} />}
        </div>
      )}

      {/* Content region — flex-grows so the footer action row pins to the
          bottom of every card at the same baseline (equal-height cards). */}
      <div className="flex-1">
      {/* Meanings */}
      {firstMeaning && (
        <div className="mt-2 space-y-0.5">
          {locale === 'en' ? (
            <>
              {(firstMeaning.en || firstMeaning.vi) && (
                <p className="text-[14px] text-ink font-medium leading-snug">
                  {cleanMeaningText(firstMeaning.en || firstMeaning.vi)}
                </p>
              )}
              {firstMeaning.en && firstMeaning.vi && (
                <p className="text-[12.5px] text-muted leading-snug">{cleanMeaningText(firstMeaning.vi)}</p>
              )}
            </>
          ) : (
            <>
              {firstMeaning.vi ? (
                <>
                  <p className="text-[14px] text-ink font-medium leading-snug">{cleanMeaningText(firstMeaning.vi)}</p>
                  {firstMeaning.en && (
                    <p className="text-[12.5px] text-muted leading-snug">{cleanMeaningText(firstMeaning.en)}</p>
                  )}
                </>
              ) : (
                <>
                  {firstMeaning.en && (
                    <p className="text-[14px] text-ink font-medium leading-snug">{cleanMeaningText(firstMeaning.en)}</p>
                  )}
                  <span className="inline-flex items-center text-[10.5px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-0.5">
                    {NO_VI_MEANING[locale] ?? NO_VI_MEANING['vi']}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* First example — distinct block with a brand-magenta left accent,
          matching the main entry's "VÍ DỤ" block. */}
      {firstExample && (
        <div className="mt-3 border-l-2 border-rose/30 pl-3">
          <p className="text-[13px] font-medium text-ink break-normal [overflow-wrap:normal]" lang="ja">
            {firstExample.ja}
          </p>
          {firstExample.reading && (
            <p className="text-[11.5px] text-muted mt-0.5 break-normal [overflow-wrap:normal]" lang="ja">
              {firstExample.reading}
            </p>
          )}
          {(locale === 'en'
            ? (firstExample.en || firstExample.vi)
            : (firstExample.vi || firstExample.en)
          ) && (
            <p className="text-[12px] text-muted/80 mt-0.5 italic">
              {locale === 'en'
                ? (firstExample.en || firstExample.vi)
                : (firstExample.vi || firstExample.en)}
            </p>
          )}
        </div>
      )}
      </div>

      {footerSlot && footerSlot}
    </div>
  )
}
