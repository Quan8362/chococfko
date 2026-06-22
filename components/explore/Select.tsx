'use client'

import type { SelectHTMLAttributes } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Wrapper class — control width/flex here (e.g. "flex-1", "w-[200px]"). */
  wrapperClassName?: string
  /** Visual size: "pill" (rounded-full, toolbar) or "field" (rounded-xl, forms). */
  variant?: 'pill' | 'field'
}

/**
 * Design-system <select> with a custom chevron (appearance-none) so it renders
 * consistently across browsers instead of the native iOS/Android control. Keeps
 * native keyboard + screen-reader behaviour. Min height 44px for touch targets.
 */
export default function Select({ wrapperClassName = '', variant = 'pill', className = '', ...rest }: Props) {
  const radius = variant === 'pill' ? 'rounded-full' : 'rounded-xl'
  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <select
        {...rest}
        className={`w-full appearance-none min-h-[44px] pl-4 pr-9 text-[13.5px] leading-tight text-ink bg-paper border border-line ${radius} focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15 cursor-pointer truncate ${className}`}
      />
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}
