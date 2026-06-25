import Link from 'next/link'
import JlptBadge from './JlptBadge'
import { cleanMeaningText } from '@/lib/sanitize'
import { displayRomaji } from '@/lib/japanese/romaji'
import type { JapaneseWord } from './WordCard'

interface WordListRowProps {
  word: JapaneseWord
  locale?: string
  actionSlot?: React.ReactNode
  /** Self-test mode — hide the kana reading + romaji. */
  hideReadings?: boolean
}

/**
 * Dense one-entry row for the dictionary's compact list view: kanji · reading ·
 * romaji · meaning · JLPT level, plus an action (bookmark). Much shorter than the
 * rich WordCard so users can scan many results quickly on a lookup page.
 */
export default function WordListRow({ word, locale = 'vi', actionSlot, hideReadings = false }: WordListRowProps) {
  const firstMeaning = word.meanings?.[0]
  const romaji = displayRomaji(word.reading, word.romaji)
  const meaning = locale === 'en'
    ? (firstMeaning?.en || firstMeaning?.vi)
    : (firstMeaning?.vi || firstMeaning?.en)

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-line bg-paper hover:border-rose/30 hover:bg-cream/40 transition-colors">
      <Link
        href={`/japanese/dictionary/${encodeURIComponent(word.word)}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
          <span
            className="text-[17px] font-bold text-ink leading-tight break-normal [line-break:strict] group-hover:text-rose transition-colors"
            lang="ja"
          >
            {word.word}
          </span>
          {!hideReadings && word.reading && word.reading !== word.word && (
            <span className="text-[12px] text-muted break-normal [line-break:strict]" lang="ja">
              {word.reading}
            </span>
          )}
          {!hideReadings && romaji && (
            <span className="text-[11.5px] text-muted/80">{romaji}</span>
          )}
        </div>
        {meaning && (
          <p className="text-[12.5px] text-muted truncate mt-0.5">{cleanMeaningText(meaning)}</p>
        )}
      </Link>
      {word.jlpt_level && <JlptBadge level={word.jlpt_level} />}
      {actionSlot && <div className="shrink-0">{actionSlot}</div>}
    </div>
  )
}
