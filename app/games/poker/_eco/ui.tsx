// ── Poker portal UI primitives ─────────────────────────────────────────────────────────────────
// PURE presentational building blocks (no hooks, no state) so they work in BOTH server and client
// components. Interactive primitives (segmented control, switch, dialog) live with the client
// screens that use them. Styling comes from _eco/portal-theme.css (`.pk-*` classes).

import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export type Tone = 'ruby' | 'emerald' | 'royal' | 'violet' | 'amber' | 'gold' | 'coral' | 'neutral'

// ── Section eyebrow ─────────────────────────────────────────────────────────────────────────
export function Eyebrow({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <span className="pk-eyebrow">
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

// ── Page header (title block above the content of a route) ──────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  tone = 'ruby',
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  icon?: IconName
  tone?: Tone
  actions?: ReactNode
}) {
  return (
    <div className="pk-fade-up mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <div className="flex items-center gap-3">
          {icon && (
            <span className={`pk-ichip pk-ichip-${tone} h-10 w-10 shrink-0`}>
              <Icon name={icon} size={22} />
            </span>
          )}
          <h1 className="font-serif text-[1.7rem] font-bold leading-tight text-[color:var(--pkp-ink)] sm:text-[2rem]">
            {title}
          </h1>
        </div>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-[color:var(--pkp-ink-2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Section title (in-page) ─────────────────────────────────────────────────────────────────
export function SectionTitle({
  children,
  icon,
  tone = 'gold',
  action,
}: {
  children: ReactNode
  icon?: IconName
  tone?: Tone
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[color:var(--pkp-ink)]">
        {icon && (
          <span className={`pk-ichip pk-ichip-${tone} h-7 w-7`}>
            <Icon name={icon} size={16} />
          </span>
        )}
        {children}
      </h2>
      {action}
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────────────────────
export function Panel({
  children,
  tint,
  className = '',
  gold,
}: {
  children: ReactNode
  tint?: boolean
  gold?: boolean
  className?: string
}) {
  return (
    <div className={`pk-panel ${tint ? 'pk-panel-tint' : ''} ${gold ? 'pk-hairline-gold' : ''} ${className}`}>{children}</div>
  )
}

// ── Metric card ─────────────────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'neutral',
  valueClassName = '',
}: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  icon?: IconName
  tone?: Tone
  valueClassName?: string
}) {
  return (
    <div className="pk-panel p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span className={`pk-ichip pk-ichip-${tone} h-7 w-7 shrink-0`}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <p className="text-[12px] font-medium text-[color:var(--pkp-ink-2)]">{label}</p>
      </div>
      <p className={`mt-2 font-serif text-2xl font-bold tabular-nums text-[color:var(--pkp-ink)] ${valueClassName}`}>{value}</p>
      {note && <p className="mt-1 text-[11px] leading-tight text-[color:var(--pkp-ink-3)]">{note}</p>}
    </div>
  )
}

// ── Empty / error state ─────────────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'cards',
  title,
  description,
  tone = 'neutral',
  children,
}: {
  icon?: IconName
  title: ReactNode
  description?: ReactNode
  tone?: Tone
  children?: ReactNode
}) {
  return (
    <div className="pk-panel pk-panel-tint flex flex-col items-center px-6 py-14 text-center">
      <span className={`pk-ichip pk-ichip-${tone} mb-4 h-14 w-14`}>
        <Icon name={icon} size={28} />
      </span>
      <p className="font-serif text-lg font-semibold text-[color:var(--pkp-ink)]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-[color:var(--pkp-ink-2)]">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

// ── Coin delta (signed result value, colour + text, never colour-alone) ─────────────────────
export function CoinDelta({
  result,
  children,
}: {
  result: 'won' | 'lost' | 'even'
  children: ReactNode
}) {
  const cls = result === 'won' ? 'pk-win' : result === 'lost' ? 'pk-loss' : 'pk-even'
  const icon: IconName | null = result === 'won' ? 'trending' : result === 'lost' ? 'trending' : null
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${cls}`}>
      {icon && <Icon name={icon} size={15} className={result === 'lost' ? 'rotate-90' : ''} />}
      {children}
    </span>
  )
}
