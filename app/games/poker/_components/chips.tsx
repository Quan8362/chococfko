'use client'

// ── Poker chips — PokerChip · PokerChipStack ───────────────────────────────────────────────
//
// Premium denomination chips with strongly distinguishable colours, edge-spot inlays and a clear
// face value. Colour is an AID only — the exact numeric value is always shown alongside any chip
// graphic (accessibility: never rely on colour alone). All amounts are integers (coin-model).
//
// `PokerChip` renders one chip (top-down disc or a thin "edge" side view). `PokerChipStack` turns
// an integer amount into realistic stacked columns via `chipBreakdown`, capped so a huge stack
// never explodes the layout, with the precise total beside it.

import { CHIP_DENOMS, chipBreakdown, type ChipDenom } from '../_design/tokens'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'

function denomFor(value: number): ChipDenom {
  let best = CHIP_DENOMS[0]
  for (const d of CHIP_DENOMS) if (value >= d.value) best = d
  return best
}

// ── Single chip (top-down) ───────────────────────────────────────────────────────────────────
export function PokerChip({
  denom,
  value,
  size = 34,
  showLabel = true,
  className = '',
}: {
  denom?: ChipDenom
  value?: number
  size?: number
  showLabel?: boolean
  className?: string
}) {
  const d = denom ?? denomFor(value ?? 1)
  const r = size / 2
  const gid = `pk-chip-${d.value}`
  // 6 edge spots around the rim — the classic chip inlay.
  const spots = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2
    return { x: r + Math.cos(a) * (r * 0.82), y: r + Math.sin(a) * (r * 0.82) }
  })
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`${formatCoinsFull(d.value)} chip`}
      style={{ display: 'block', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={d.base} />
          <stop offset="100%" stopColor={d.ring} />
        </radialGradient>
      </defs>
      {/* body */}
      <circle cx={r} cy={r} r={r - 1} fill={`url(#${gid})`} stroke={d.ring} strokeWidth={1} />
      {/* edge spots */}
      {spots.map((s, i) => (
        <rect
          key={i}
          x={s.x - size * 0.07}
          y={s.y - size * 0.045}
          width={size * 0.14}
          height={size * 0.09}
          rx={size * 0.02}
          fill={d.edge}
          transform={`rotate(${(i / 6) * 360} ${s.x} ${s.y})`}
          opacity={0.92}
        />
      ))}
      {/* inner ring + face */}
      <circle cx={r} cy={r} r={r * 0.62} fill="none" stroke={d.edge} strokeWidth={Math.max(1, size * 0.025)} opacity={0.55} />
      <circle cx={r} cy={r} r={r * 0.56} fill={d.base} opacity={0.55} />
      {/* top sheen */}
      <ellipse cx={r} cy={r * 0.62} rx={r * 0.5} ry={r * 0.24} fill="#ffffff" opacity={0.12} />
      {showLabel && (
        <text
          x={r}
          y={r}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={size * (d.label.length > 2 ? 0.26 : 0.32)}
          fontWeight={800}
          fill={d.ink}
          style={{ fontFamily: 'var(--font-bvp), sans-serif' }}
        >
          {d.label}
        </text>
      )}
    </svg>
  )
}

// ── Chip stack (amount → realistic columns + exact value) ─────────────────────────────────────
export function PokerChipStack({
  amount,
  chipSize = 30,
  showValue = true,
  compact = false,
  className = '',
  ariaLabel,
}: {
  amount: number
  chipSize?: number
  showValue?: boolean
  compact?: boolean // smaller mobile footprint (fewer chips per column)
  className?: string
  ariaLabel?: string
}) {
  const cols = chipBreakdown(amount, compact ? { maxColumns: 3, maxPerColumn: 4 } : undefined)
  const overlap = Math.round(chipSize * 0.18) // vertical exposed edge per stacked chip
  return (
    <span className={`inline-flex items-end gap-1.5 ${className}`} aria-label={ariaLabel ?? `${formatCoinsFull(amount)} coins`}>
      {amount > 0 && (
        <span className="inline-flex items-end gap-[3px]" aria-hidden>
          {cols.map((col, ci) => (
            <span
              key={ci}
              className="relative inline-block"
              style={{ width: chipSize, height: chipSize + (col.drawCount - 1) * overlap }}
            >
              {Array.from({ length: col.drawCount }).map((_, i) => (
                <span key={i} className="absolute left-0" style={{ bottom: i * overlap }}>
                  {/* only the top chip shows its denomination label */}
                  <PokerChip denom={col.denom} size={chipSize} showLabel={i === col.drawCount - 1} />
                </span>
              ))}
            </span>
          ))}
        </span>
      )}
      {showValue && (
        <span
          className="pk-felt-scrim font-bold tabular-nums"
          style={{ color: 'var(--pk-gold-soft)', fontSize: compact ? 12 : 13.5 }}
          title={formatCoinsFull(amount)}
        >
          {formatCoinsShort(amount)}
        </span>
      )}
    </span>
  )
}
