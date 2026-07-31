import type { ReactNode } from 'react'

// Shared page container for the whole tournament module (public + management). One primitive so every
// route lines up on the same responsive rhythm instead of each page hard-coding its own narrow column.
//
//   size="wide"   → list / detail reading surfaces (public list, public detail, management list)
//   size="detail" → management detail (main + sidebar grid fits comfortably)
//   size="form"   → focused create / edit forms
//
// Padding follows the spec: 16px mobile · 24px tablet · 32px desktop. `trn-scope` opts descendants
// into the module's slim themed scrollbar (see globals.css) so Windows never paints the native
// stepper-arrow scrollbar ("phantom arrows") on tab strips, modals or board columns.
const WIDTHS = {
  wide: 'max-w-[1240px]',
  detail: 'max-w-[1120px]',
  form: 'max-w-[840px]',
} as const

export type TournamentShellSize = keyof typeof WIDTHS

export default function TournamentShell({
  size = 'wide',
  className = '',
  children,
}: {
  size?: TournamentShellSize
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`trn-scope w-full ${WIDTHS[size]} mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 pb-20 ${className}`}>
      {children}
    </div>
  )
}
