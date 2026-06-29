import type { CoinTier } from '@/lib/games/coinTier'

// ── Reusable coin-rank badge ────────────────────────────────────────────────────────
// One premium, framework-neutral emblem (no hooks → renders in server OR client). Pass a
// localized `label` for the accessible name + tooltip (callers already have t()). Distinct
// silhouettes so tier reads at a glance even at avatar-corner size:
//   bronze/silver/gold → metallic shield + star · diamond → faceted gem · vip → crown.
// Colour is NEVER the only signal: shape differs per tier and an aria-label is always set.
// Effects are static (a soft glow on diamond/vip) so there is no motion to disable —
// inherently honours prefers-reduced-motion.

const SIZE_PX: Record<'xs' | 'sm' | 'md' | 'lg', number> = { xs: 14, sm: 18, md: 24, lg: 32 }

type Palette = { from: string; via: string; to: string; stroke: string; emblem: string; glow?: string }

const PALETTE: Record<CoinTier, Palette> = {
  bronze:  { from: '#e8b88a', via: '#c87b46', to: '#8a4a23', stroke: '#6e3a1c', emblem: '#fff2e2' },
  silver:  { from: '#f4f6f8', via: '#c3ccd6', to: '#8a96a4', stroke: '#6f7b8a', emblem: '#ffffff' },
  gold:    { from: '#f7e3a1', via: '#e0b341', to: '#a9801f', stroke: '#8a6516', emblem: '#fff8e3' },
  diamond: { from: '#eaf6ff', via: '#aacdf0', to: '#7aa6d8', stroke: '#5b87c0', emblem: '#ffffff', glow: 'rgba(150,200,255,0.65)' },
  vip:     { from: '#3a1422', via: '#5e1d30', to: '#2a0d17', stroke: '#e3b23c', emblem: '#f6d989', glow: 'rgba(227,178,60,0.6)' },
}

// A rounded shield (bronze/silver/gold), a faceted gem (diamond) or a crown (vip).
function Emblem({ tier }: { tier: CoinTier }) {
  if (tier === 'diamond') {
    return <path d="M24 6 39 19 24 42 9 19Z M9 19H39 M24 6 17 19 24 42 M24 6 31 19 24 42" />
  }
  if (tier === 'vip') {
    return <path d="M9 34 7 14 16 21 24 9 32 21 41 14 39 34Z" />
  }
  // metallic shield
  return <path d="M24 6 40 11V24C40 34 33 40 24 43 15 40 8 34 8 24V11Z" />
}

// A small star (metals) / sparkle centre, drawn over the emblem for extra recognizability.
function Center({ tier, color }: { tier: CoinTier; color: string }) {
  if (tier === 'diamond' || tier === 'vip') return null
  return (
    <path
      fill={color}
      d="M24 15 26.5 21 33 21.5 28 25.7 29.7 32 24 28.4 18.3 32 20 25.7 15 21.5 21.5 21Z"
    />
  )
}

export function CoinTierBadge({
  tier,
  size = 'sm',
  label,
  className = '',
}: {
  tier: CoinTier
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Localized accessible name + tooltip, e.g. "Huy hiệu Vàng – số dư từ 3 tỷ xu". */
  label: string
  className?: string
}) {
  const px = SIZE_PX[size]
  const pal = PALETTE[tier]
  const gid = `ctb-${tier}`
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex flex-none align-middle ${className}`}
      style={{ width: px, height: px, filter: pal.glow ? `drop-shadow(0 0 ${Math.round(px * 0.18)}px ${pal.glow})` : undefined }}
    >
      <svg viewBox="0 0 48 48" width={px} height={px} aria-hidden style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.from} />
            <stop offset="55%" stopColor={pal.via} />
            <stop offset="100%" stopColor={pal.to} />
          </linearGradient>
        </defs>
        <g fill={`url(#${gid})`} stroke={pal.stroke} strokeWidth="2.5" strokeLinejoin="round">
          <Emblem tier={tier} />
        </g>
        {/* top sheen for a metallic read */}
        <path d="M24 8 36 12V18C30 15 18 15 12 18V12Z" fill="#ffffff" opacity="0.18" />
        <g stroke="none">
          <Center tier={tier} color={pal.emblem} />
        </g>
      </svg>
    </span>
  )
}
