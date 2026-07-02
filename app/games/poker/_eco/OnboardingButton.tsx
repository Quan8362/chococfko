'use client'

// A small client button that opens (or restarts) the onboarding tour rendered by
// OnboardingProvider, via a window event. Used on the Learn hub so a server component can offer
// "Start the tour" / "Restart" without itself becoming a client component.

import type { ReactNode } from 'react'

export default function OnboardingButton({
  mode = 'open',
  className = '',
  testId,
  children,
}: {
  mode?: 'open' | 'restart'
  className?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => window.dispatchEvent(new CustomEvent('poker:onboarding', { detail: mode }))}
      className={className}
    >
      {children}
    </button>
  )
}
