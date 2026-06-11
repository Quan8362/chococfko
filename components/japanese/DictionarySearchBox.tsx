'use client'

import { useRef } from 'react'

interface DictionarySearchBoxProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onFocus?: () => void
  onBlur?: () => void
  onSubmit?: (v: string) => void
  /** Keyboard navigation for an attached suggestions listbox (optional). */
  onArrowDown?: () => void
  onArrowUp?: () => void
  /** Called on Enter. Return true if the parent consumed it (e.g. opened a highlighted suggestion). */
  onEnterSelect?: () => boolean
  onEscape?: () => void
  /** Accessibility wiring for the combobox/listbox pattern (optional). */
  listboxId?: string
  activeOptionId?: string
  expanded?: boolean
  clearLabel?: string
}

export default function DictionarySearchBox({
  value, onChange, placeholder, onFocus, onBlur, onSubmit,
  onArrowDown, onArrowUp, onEnterSelect, onEscape,
  listboxId, activeOptionId, expanded, clearLabel = 'Clear search',
}: DictionarySearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && onArrowDown) {
      e.preventDefault()
      onArrowDown()
    } else if (e.key === 'ArrowUp' && onArrowUp) {
      e.preventDefault()
      onArrowUp()
    } else if (e.key === 'Enter') {
      const handled = onEnterSelect ? onEnterSelect() : false
      if (handled) {
        e.preventDefault()
        return
      }
      if (value.trim()) onSubmit?.(value.trim())
    } else if (e.key === 'Escape') {
      if (onEscape) onEscape()
      else onBlur?.()
    }
  }

  function handleClear() {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      {/* Search icon */}
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
        <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role={listboxId ? 'combobox' : undefined}
        aria-expanded={listboxId ? !!expanded : undefined}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete={listboxId ? 'list' : undefined}
        className="w-full pl-12 pr-12 py-4 text-[16px] bg-paper border-2 border-line rounded-2xl text-ink placeholder:text-muted/60 focus:outline-none focus:border-rose/50 focus:shadow-[0_0_0_3px_rgba(194,24,91,0.08)] transition-all"
      />
      {/* Clear button (single, custom) */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearLabel}
          className="absolute inset-y-0 right-4 flex items-center text-muted hover:text-ink transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
