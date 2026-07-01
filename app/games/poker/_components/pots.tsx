'use client'

// ── Pots & street — PotDisplay · SidePotDisplay · StreetIndicator ────────────────────────────
//
// The pot area sits below the board, centred. The main pot is prominent; side pots stack beside
// it, each LABELLED ("Main", "Side 1"…) and visually distinct so eligibility stays legible even
// with several (EC-D2 / POT-INDEP-001). On mobile, many side pots collapse to a summary chip.
// All values are exact integers; colour is never the sole signal (every pot shows its label +
// number). The UI renders authoritative pot values — it never computes them.

import type { Pots } from '@/lib/games/poker/types'
import { useTranslations } from 'next-intl'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import { PokerChipStack } from './chips'

// One pot pill. The main pot is larger and gold-trimmed; side pots are navy-trimmed.
function PotPill({
  label,
  amount,
  kind,
  compact = false,
}: {
  label: string
  amount: number
  kind: 'main' | 'side'
  compact?: boolean
}) {
  const main = kind === 'main'
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full"
      style={{
        padding: compact ? '4px 9px' : '6px 12px',
        background: main ? 'linear-gradient(180deg, rgba(33,28,40,0.95), rgba(8,7,10,0.95))' : 'rgba(0,0,0,0.5)',
        border: `1px solid ${main ? 'var(--pk-gold-line)' : 'rgba(45,91,142,0.55)'}`,
        boxShadow: main ? 'var(--pk-shadow-seat)' : undefined,
      }}
      title={formatCoinsFull(amount)}
    >
      <span
        className="font-semibold uppercase tracking-wide"
        style={{ fontSize: compact ? 10 : 11, color: main ? 'var(--pk-gold-soft)' : 'var(--pk-navy)' }}
      >
        {label}
      </span>
      <span className="pk-felt-scrim font-extrabold tabular-nums" style={{ fontSize: compact ? 13 : 15, color: 'var(--pk-text-hi)' }}>
        {formatCoinsShort(amount)}
      </span>
    </span>
  )
}

// Full pot display: main pot + chip stack, plus side pots (or a collapsed summary on mobile).
export function PotDisplay({
  pots,
  compact = false,
  withChips = true,
}: {
  pots: Pots
  compact?: boolean
  withChips?: boolean
}) {
  const t = useTranslations('games.poker')
  const total = pots.main.amount + pots.sides.reduce((s, p) => s + p.amount, 0)
  return (
    <span className="flex flex-col items-center gap-1.5">
      {withChips && total > 0 && <PokerChipStack amount={total} chipSize={compact ? 22 : 28} showValue={false} compact={compact} />}
      <span className="flex flex-wrap items-center justify-center gap-1.5">
        <PotPill label={t('pot.main')} amount={pots.main.amount} kind="main" compact={compact} />
        {!compact && pots.sides.map((p, i) => (
          <PotPill key={i} label={t('pot.side', { n: i + 1 })} amount={p.amount} kind="side" compact={compact} />
        ))}
        {compact && pots.sides.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(45,91,142,0.55)' }}>
            <span className="font-semibold" style={{ fontSize: 10, color: 'var(--pk-navy)' }}>
              {t('pot.side_summary', { n: pots.sides.length })}
            </span>
            <span className="font-bold tabular-nums" style={{ fontSize: 12, color: 'var(--pk-text-hi)' }}>
              {formatCoinsShort(pots.sides.reduce((s, p) => s + p.amount, 0))}
            </span>
          </span>
        )}
      </span>
    </span>
  )
}

// Standalone side-pot list with eligibility — used in an expandable detail (e.g. tap the mobile
// summary). Each pot shows which seat indexes can win it (a structural, colour-independent cue).
export function SidePotDisplay({ pots }: { pots: Pots }) {
  const t = useTranslations('games.poker')
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--pk-gold-line)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pk-gold-soft)' }}>
          {t('pot.main')}
        </span>
        <span className="font-bold tabular-nums" style={{ color: 'var(--pk-text-hi)' }} title={formatCoinsFull(pots.main.amount)}>
          {formatCoinsShort(pots.main.amount)}
        </span>
      </span>
      {pots.sides.map((p, i) => (
        <span key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(45,91,142,0.5)' }}>
          <span className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pk-navy)' }}>
              {t('pot.side', { n: i + 1 })}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--pk-text-low)' }}>
              {t('pot.eligible', { seats: p.eligibleSeatIndexes.map((s) => s + 1).join(', ') })}
            </span>
          </span>
          <span className="font-bold tabular-nums" style={{ color: 'var(--pk-text-hi)' }} title={formatCoinsFull(p.amount)}>
            {formatCoinsShort(p.amount)}
          </span>
        </span>
      ))}
    </span>
  )
}

// ── StreetIndicator ───────────────────────────────────────────────────────────────────────────
// A compact tab of the current street. Each street has a distinct accent AND its own label.
export type StreetName = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'

export function StreetIndicator({ street, compact = false }: { street: StreetName; compact?: boolean }) {
  const t = useTranslations('games.poker')
  const accent: Record<StreetName, string> = {
    PREFLOP: 'var(--pk-text-mid)',
    FLOP: 'var(--pk-emerald)',
    TURN: 'var(--pk-navy)',
    RIVER: 'var(--pk-amber)',
    SHOWDOWN: 'var(--pk-gold-soft)',
  }
  const key = street.toLowerCase()
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{
        padding: compact ? '3px 9px' : '4px 11px',
        background: 'rgba(0,0,0,0.5)',
        border: `1px solid ${accent[street]}`,
      }}
    >
      <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: accent[street] }} aria-hidden />
      <span className="font-bold uppercase tracking-wide" style={{ fontSize: compact ? 10.5 : 12, color: 'var(--pk-text-hi)' }}>
        {t(`street.${key}`)}
      </span>
    </span>
  )
}
