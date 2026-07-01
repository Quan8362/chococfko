'use client'

// ── Table markers — DealerButton · SmallBlindBadge · BigBlindBadge · AllInBadge ─────────────
//
// Small, premium status discs/pills. Each carries BOTH a glyph and an accessible label (colour is
// never the only signal). The dealer button visibly moves one seat clockwise each hand
// (BUTTON-MOVE-001) — this component just renders it; placement is the seat layer's job.

import { useTranslations } from 'next-intl'

function Disc({
  text,
  size,
  base,
  ring,
  ink,
  label,
}: {
  text: string
  size: number
  base: string
  ring: string
  ink: string
  label: string
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center font-black leading-none select-none"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(120% 120% at 50% 30%, ${base} 0%, ${ring} 100%)`,
        border: `1px solid ${ring}`,
        color: ink,
        fontSize: size * (text.length > 1 ? 0.4 : 0.5),
        boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
        letterSpacing: text.length > 1 ? '-0.02em' : 0,
      }}
    >
      {text}
    </span>
  )
}

// Classic white "D" dealer button.
export function DealerButton({ size = 24 }: { size?: number }) {
  const t = useTranslations('games.poker')
  return <Disc text={t('marker.dealer_abbr')} label={t('marker.dealer')} size={size} base="#f4efe6" ring="#c9c2b2" ink="#241b18" />
}

// Small-blind badge — navy.
export function SmallBlindBadge({ size = 22 }: { size?: number }) {
  const t = useTranslations('games.poker')
  return <Disc text={t('marker.sb_abbr')} label={t('marker.small_blind')} size={size} base="#3a6ba3" ring="#1c3c61" ink="#eaf2fb" />
}

// Big-blind badge — burgundy.
export function BigBlindBadge({ size = 22 }: { size?: number }) {
  const t = useTranslations('games.poker')
  return <Disc text={t('marker.bb_abbr')} label={t('marker.big_blind')} size={size} base="#b5384c" ring="#6e1c2c" ink="#fbe9ec" />
}

// All-in badge — an amber pill with an icon + label, clearly distinct from the blind discs.
export function AllInBadge({ small = false }: { small?: boolean }) {
  const t = useTranslations('games.poker')
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wide leading-none select-none"
      style={{
        padding: small ? '3px 7px' : '4px 9px',
        borderRadius: 999,
        fontSize: small ? 10.5 : 12,
        color: '#1a1206',
        background: 'linear-gradient(180deg, #e6b256 0%, #d99836 60%, #b87f24 100%)',
        border: '1px solid rgba(0,0,0,0.35)',
        boxShadow: '0 2px 5px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
      }}
    >
      <svg width={small ? 10 : 12} height={small ? 10 : 12} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
      </svg>
      {t('marker.all_in')}
    </span>
  )
}
