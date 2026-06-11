'use client'

import { useEffect, useRef } from 'react'
import JlptBadge from './JlptBadge'

export type SuggestionWord = {
  id: string
  word: string
  reading: string | null
  jlpt_level: string | null
  meanings: { vi: string; en: string }[] | null
}

type Props = {
  suggestions: SuggestionWord[]
  onSelect: (word: string) => void
  locale?: string
  /** Index of the keyboard-highlighted option (-1 = none). */
  activeIndex?: number
  /** Sync the highlight when the mouse hovers an option. */
  onActiveChange?: (index: number) => void
  /** id of the listbox, used for aria wiring. Option ids are `${listboxId}-opt-${i}`. */
  listboxId?: string
}

export default function SearchSuggestions({
  suggestions, onSelect, locale = 'vi', activeIndex = -1, onActiveChange, listboxId,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the highlighted option scrolled into view when navigating by keyboard.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!suggestions.length) return null

  return (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-[60vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-[0_8px_32px_-8px_rgba(36,26,23,0.18)]"
    >
      {suggestions.map((s, i) => {
        const meaning = s.meanings?.[0]
        const displayMeaning = locale === 'vi' ? meaning?.vi : meaning?.en
        const active = i === activeIndex
        return (
          <li
            key={s.id}
            id={listboxId ? `${listboxId}-opt-${i}` : undefined}
            role="option"
            aria-selected={active}
            data-index={i}
            onMouseDown={e => { e.preventDefault(); onSelect(s.word) }}
            onMouseEnter={() => onActiveChange?.(i)}
            className={`w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left group ${
              i > 0 ? 'border-t border-line/50' : ''
            } ${active ? 'bg-rose/10' : 'hover:bg-rose/5'} first:rounded-t-2xl last:rounded-b-2xl`}
          >
            <svg className="w-4 h-4 text-muted/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={`text-[15px] font-bold transition-colors ${active ? 'text-rose' : 'text-ink group-hover:text-rose'}`} lang="ja">
                  {s.word}
                </span>
                {s.reading && s.reading !== s.word && (
                  <span className="text-[12px] text-muted" lang="ja">{s.reading}</span>
                )}
              </div>
              {displayMeaning && (
                <p className="text-[12px] text-muted truncate">{displayMeaning}</p>
              )}
            </div>
            {s.jlpt_level && (
              <div className="shrink-0">
                <JlptBadge level={s.jlpt_level} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
