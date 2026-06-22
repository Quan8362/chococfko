'use client'

import { useEffect, useState } from 'react'

// Accessible toggle switch. Vertical centering comes from flexbox (items-center)
// and the thumb slides via translateX of a value derived from track/thumb sizes
// — no fragile absolute top/left pixel offsets, so it can never detach or clip.
// The semantic <button role="switch"> handles Space/Enter and focus natively.
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  stateOnText,
  stateOffText,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  stateOnText: string
  stateOffText: string
}) {
  const reduce = useReducedMotion()
  // Track 48×28, thumb 24, 2px padding each side → travel = 48 - 24 - 4 = 20px.
  const travel = 20
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`text-[12px] font-semibold tabular-nums ${checked ? 'text-rose' : 'text-muted'}`} aria-hidden>
        {checked ? stateOnText : stateOffText}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
          disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-rose' : 'bg-line'}`}
      >
        <span
          aria-hidden
          className={`h-6 w-6 rounded-full bg-white shadow-sm ${reduce ? '' : 'transition-transform duration-200'}`}
          style={{ transform: `translateX(${checked ? travel : 0}px)` }}
        />
      </button>
    </span>
  )
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(m.matches)
    const h = () => setReduce(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return reduce
}
