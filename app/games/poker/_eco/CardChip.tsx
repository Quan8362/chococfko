import type { Card, Suit } from '@/lib/games/poker/types'

// ── History / replay card face — standard playing-card look ────────────────────────────────────
// Display-only card used by the hand replay (history page renders in the LIGHT site theme, NOT the
// dark .poker-root, so this is self-contained and does not depend on the poker-theme CSS vars).
// Standard face: a rank+suit index in the top-left, mirrored bottom-right, and a centred suit pip.
// Suits are ALWAYS inline SVG (never OS emoji — emoji lose their red/black colour on Windows), and
// colour is never the only signal: every card shows the rank glyph + the suit shape.

const RED = '#c2253e' // true playing-card red for ♥♦
const INK = '#1a1714' // near-black for ♠♣

// Suit glyphs in a shared 48×48 viewBox so every suit scales uniformly.
const SPADE =
  'M24 5C24 5 9 16 9 27 9 32 12 35 16 35 18.5 35 20.5 34 22 32.5 21.5 36 20 39.5 17 42L31 42C28 39.5 26.5 36 26 32.5 27.5 34 29.5 35 32 35 36 35 39 32 39 27 39 16 24 5 24 5Z'
const DIAMOND = 'M24 3 41 24 24 45 7 24Z'
const HEART =
  'M24 42C24 42 7 30 7 17 7 10.8 11.6 6 16.5 6 20 6 22.8 8.3 24 11.2 25.2 8.3 28 6 31.5 6 36.4 6 41 10.8 41 17 41 30 24 42 24 42Z'

function SuitGlyph({ suit }: { suit: Suit }) {
  if (suit === 'c') {
    return (
      <>
        <circle cx="24" cy="15" r="8.4" />
        <circle cx="14.6" cy="27.4" r="8.4" />
        <circle cx="33.4" cy="27.4" r="8.4" />
        <path d="M20.4 28C21 33.4 19 38.5 14.5 42L33.5 42C29 38.5 27 33.4 27.6 28Z" />
      </>
    )
  }
  return <path d={suit === 's' ? SPADE : suit === 'd' ? DIAMOND : HEART} />
}

function Pip({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <SuitGlyph suit={suit} />
    </svg>
  )
}

const SUIT_LABEL: Record<Suit, string> = { s: 'spades', c: 'clubs', d: 'diamonds', h: 'hearts' }
// card width in px per size; height derives from the true 5:7 playing-card ratio.
const WIDTH: Record<'sm' | 'md', number> = { sm: 30, md: 40 }

// Pure presentational card (rank + suit). Used by replay / hand detail. Display only.
export function CardChip({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' }) {
  const rankRaw = card.slice(0, -1)
  const rank = rankRaw.replace('T', '10')
  const suit = card.slice(-1) as Suit
  const known = suit === 's' || suit === 'c' || suit === 'd' || suit === 'h'
  const color = suit === 'h' || suit === 'd' ? RED : INK

  const w = WIDTH[size]
  const h = Math.round(w * 1.4)
  const rankSize = Math.round(w * 0.36)
  const cornerSuit = Math.round(w * 0.22)
  const centerSuit = Math.round(w * 0.52)
  const padX = Math.max(2, Math.round(w * 0.08))
  const padY = Math.max(1, Math.round(w * 0.05))

  if (!known) {
    return (
      <span
        role="img"
        aria-label="unknown card"
        className="inline-flex items-center justify-center rounded-md border border-line bg-white font-semibold text-ink shadow-sm"
        style={{ width: w, height: h, fontSize: rankSize }}
      >
        ?
      </span>
    )
  }

  const index = (
    <span className="flex flex-col items-center leading-[0.82]">
      <span className="font-black" style={{ fontSize: rankSize }}>
        {rank}
      </span>
      <Pip suit={suit} size={cornerSuit} color={color} />
    </span>
  )

  return (
    <span
      role="img"
      aria-label={`${rank} of ${SUIT_LABEL[suit]}`}
      className="relative inline-flex select-none overflow-hidden rounded-md border border-line bg-white leading-none shadow-sm"
      style={{ width: w, height: h, color }}
    >
      <span className="absolute z-10 flex flex-col items-center" style={{ top: padY, left: padX }}>
        {index}
      </span>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <Pip suit={suit} size={centerSuit} color={color} />
      </span>
      <span className="absolute z-10 flex rotate-180 flex-col items-center" style={{ bottom: padY, right: padX }}>
        {index}
      </span>
    </span>
  )
}

// Face-down card — deep plum lattice, matching the replay chrome. Same footprint as CardChip.
export function HiddenCard({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const w = WIDTH[size]
  const h = Math.round(w * 1.4)
  return (
    <span
      role="img"
      aria-label="face down card"
      className="relative inline-block overflow-hidden rounded-md border border-line shadow-sm"
      style={{ width: w, height: h, background: 'linear-gradient(135deg, #2a1a3e 0%, #4a2a5e 100%)' }}
    >
      <span
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 6px)',
        }}
      />
      <span className="absolute inset-[3px] rounded-[4px] border border-white/25" />
    </span>
  )
}
