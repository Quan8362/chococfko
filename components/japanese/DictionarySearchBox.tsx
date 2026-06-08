'use client'

interface DictionarySearchBoxProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onFocus?: () => void
  onBlur?: () => void
  onSubmit?: (v: string) => void
}

export default function DictionarySearchBox({ value, onChange, placeholder, onFocus, onBlur, onSubmit }: DictionarySearchBoxProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit?.(value.trim())
    } else if (e.key === 'Escape') {
      onBlur?.()
    }
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
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full pl-12 pr-12 py-4 text-[16px] bg-paper border-2 border-line rounded-2xl text-ink placeholder:text-muted/60 focus:outline-none focus:border-rose/50 focus:shadow-[0_0_0_3px_rgba(194,24,91,0.08)] transition-all"
      />
      {/* Clear button */}
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
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
