'use client'

import { RANKS, R2, type Card } from '@/lib/games/tlmn/engine'

// ── Suit pips as inline SVG ──────────────────────────────────────────────────────
// Vector paths (24×24 viewBox) so suits stay razor-crisp at every card size and never
// fall back to the OS emoji renderer (which turns ♥♦ into coloured glyphs and breaks
// the brand magenta). Index = suit: ♠ bích, ♣ chuồn, ♦ rô, ♥ cơ.
const SUIT_PATH = [
  // ♠ spade
  'M12 2C8.5 6 3.5 8.5 3.5 13c0 2.49 2.01 4.5 4.5 4.5 1.06 0 2.04-.37 2.81-.98C10.5 18.5 9.5 20 8 21v.6h8V21c-1.5-1-2.5-2.5-2.81-4.48.77.61 1.75.98 2.81.98 2.49 0 4.5-2.01 4.5-4.5C20.5 8.5 15.5 6 12 2z',
  // ♣ club
  'M12 2C9.79 2 8 3.79 8 6c0 .73.2 1.41.54 2C6.79 8.13 5.5 9.62 5.5 11.5 5.5 13.71 7.29 15.5 9.5 15.5c.73 0 1.41-.2 2-.54C11.13 16.7 10 18.4 8 19.5v.6h8v-.6c-2-1.1-3.13-2.8-3.5-4.54.59.34 1.27.54 2 .54 2.21 0 4-1.79 4-4 0-1.88-1.29-3.37-3.04-3.5.34-.59.54-1.27.54-2C18.04 3.79 16.25 2 14 2c-.74 0-1.43.2-2.02.56C11.43 2.2 12 2 12 2z',
  // ♦ diamond
  'M12 2l8.5 10L12 22 3.5 12 12 2z',
  // ♥ heart
  'M12 21s-6.716-4.297-9.428-7.01C.86 12.28.5 10.5.5 9 .5 6.46 2.46 4.5 5 4.5c1.7 0 3.2.9 4 2.26.8-1.36 2.3-2.26 4-2.26 2.54 0 4.5 1.96 4.5 4.5 0 1.5-.36 3.28-2.07 4.99C18.716 16.703 12 21 12 21z',
] as const

const INK = '#1a1a1a'
const MAGENTA = '#d6006c'

function SuitPip({ suit, size, color }: { suit: number; size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <path d={SUIT_PATH[suit]} />
    </svg>
  )
}

// Lightweight CSS+SVG playing card — crisp at any size, legible down to ~360px. Red
// for ♦♥ (brand magenta), ink for ♠♣. Aspect 5:7. The "2" (heo) gets a subtle gold
// accent since it's the top single. Soft, flat-ish shadow — depth, not heaviness.
//
// States (all legible on dark felt):
//   default      — ring-line + shadow-card
//   interactive  — desktop hover lifts + deepens the shadow (touch: no sticky hover)
//   playable     — subtle magenta outline (a card that appears in a legal play)
//   selected     — magenta ring + soft magenta shadow (the lift is applied by the parent)
//   dim          — desaturated + lower contrast (not playable this turn)
export function CardFace({
  card, w = 46, selected = false, dim = false, playable = false, interactive = false, raised = false,
}: {
  card: Card
  w?: number
  selected?: boolean
  dim?: boolean
  playable?: boolean
  interactive?: boolean
  raised?: boolean
}) {
  const red = card.suit >= 2
  const isHeo = card.rank === R2
  const h = Math.round(w * 1.4) // 5:7
  const rank = RANKS[card.rank]
  const color = red ? MAGENTA : INK
  const cornerSuit = Math.round(w * 0.26)
  const centerSuit = Math.round(w * 0.52)
  const rankSize = Math.round(w * 0.34)

  return (
    <span
      className={[
        'relative inline-flex flex-col select-none rounded-[7px] bg-white leading-none transition-all duration-150',
        interactive && !dim ? 'tlmn-card-int' : '',
        selected
          ? 'ring-2 ring-rose shadow-[0_10px_22px_-6px_rgba(214,0,108,0.6)]'
          : playable && !dim
            ? 'ring-[1.5px] ring-rose/55 shadow-card'
            : isHeo && !dim
              ? 'ring-1 ring-line shadow-[0_0_0_1.5px_rgba(201,154,61,0.55)]'
              : 'ring-1 ring-line shadow-card',
        raised ? '-translate-y-2' : '',
        dim ? 'opacity-40 grayscale-[45%] contrast-[0.92]' : '',
      ].join(' ')}
      style={{ width: w, height: h, color }}
    >
      {/* top-left corner */}
      <span className="absolute top-[3px] left-[4px] flex flex-col items-center leading-[0.9]">
        <span className="font-black" style={{ fontSize: rankSize }}>{rank}</span>
        <SuitPip suit={card.suit} size={cornerSuit} color={color} />
      </span>
      {/* center pip */}
      <span className="absolute inset-0 flex items-center justify-center opacity-90">
        <SuitPip suit={card.suit} size={centerSuit} color={color} />
      </span>
      {/* bottom-right corner (mirrored 180°) */}
      <span className="absolute bottom-[3px] right-[4px] flex flex-col items-center leading-[0.9] rotate-180">
        <span className="font-black" style={{ fontSize: rankSize }}>{rank}</span>
        <SuitPip suit={card.suit} size={cornerSuit} color={color} />
      </span>
      {isHeo && !dim && (
        <span className="absolute top-[3px] right-[4px] text-gold" style={{ fontSize: Math.round(w * 0.22) }}>★</span>
      )}
    </span>
  )
}

// Face-down card back with a subtle chococfko motif: a warm magenta field, a fine
// double frame and a centred diamond monogram on a soft tonal lattice. Consistent
// radius/shadow with CardFace; clearly distinct from the deep-red felt.
export function CardBack({ w = 30, className = '' }: { w?: number; className?: string }) {
  const h = Math.round(w * 1.4)
  return (
    <span
      className={`relative inline-block rounded-[6px] ring-1 ring-rose-deep/40 shadow-card overflow-hidden ${className}`}
      style={{
        width: w,
        height: h,
        background:
          'radial-gradient(120% 120% at 50% 0%, #e0307f 0%, #d6006c 45%, #b00c58 100%)',
      }}
    >
      {/* fine cross-lattice */}
      <span
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 6px)',
        }}
      />
      {/* double frame */}
      <span className="absolute inset-[2px] rounded-[4px] border border-white/30" />
      <span className="absolute inset-[4px] rounded-[3px] border border-white/15" />
      {/* monogram */}
      <span className="absolute inset-0 flex items-center justify-center">
        <SuitPip suit={2} size={Math.round(w * 0.5)} color="rgba(255,255,255,0.92)" />
      </span>
    </span>
  )
}

// A small fanned stack of face-down backs representing an opponent's hand size.
export function FannedBacks({ count, w = 26 }: { count: number; w?: number }) {
  const shown = Math.min(Math.max(count, 0), 5)
  if (shown <= 0) return null
  const h = Math.round(w * 1.4)
  return (
    <span className="relative inline-block" style={{ height: h + 6, width: w + (shown - 1) * 9 }}>
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className="absolute bottom-0"
          style={{
            left: i * 9,
            transform: `rotate(${(i - (shown - 1) / 2) * 4}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <CardBack w={w} />
        </span>
      ))}
    </span>
  )
}

// ── Opponent hand fan ────────────────────────────────────────────────────────────
// A real fan of face-down backs sized to the opponent's hand. Orientation drives the
// axis: 'top' fans HORIZONTALLY (upright backs), 'left'/'right' fan VERTICALLY with
// each back rotated 90° (held sideways). Overlap ≈ FAN_OVERLAP of a card; a gentle,
// mirrored arc. The wrapper reserves the rotated bounding box so the felt never clips
// it. The count badge is NOT drawn here — it lives upright beside the avatar.
const FAN_OVERLAP = 0.65 // matches --fan-overlap token
const MAX_FANNED = 13     // a full TLMN hand

export function OpponentFan({
  count, w, orientation,
}: { count: number; w: number; orientation: 'top' | 'left' | 'right' }) {
  const n = Math.min(Math.max(count, 0), MAX_FANNED)
  if (n <= 0) return null
  const h = Math.round(w * 1.4)
  const step = Math.round(w * (1 - FAN_OVERLAP)) // exposed strip per card
  const arcPer = n > 1 ? Math.min(2.2, 12 / n) : 0 // total spread stays gentle
  const mid = (n - 1) / 2

  if (orientation === 'top') {
    // Horizontal fan of upright backs, slight downward arc + parabolic lift.
    const totalW = w + (n - 1) * step
    return (
      <span className="relative inline-block" style={{ width: totalW, height: h + 10 }}>
        {Array.from({ length: n }).map((_, i) => {
          const off = i - mid
          const lift = Math.round((1 - (off / (mid || 1)) ** 2) * 6) // parabola
          return (
            <span
              key={i}
              className="absolute bottom-0"
              style={{ left: i * step, transform: `translateY(${-lift}px) rotate(${off * arcPer}deg)`, transformOrigin: 'bottom center' }}
            >
              <CardBack w={w} />
            </span>
          )
        })}
      </span>
    )
  }

  // Vertical fan (left/right): each back rotated 90°, stacked top→bottom. After the
  // 90° turn a card occupies h wide × w tall, so the reserved box swaps dimensions.
  const boxW = h + 10
  const boxH = w + (n - 1) * step
  const dir = orientation === 'left' ? 1 : -1 // mirror the arc toward the table centre
  return (
    <span className="relative inline-block" style={{ width: boxW, height: boxH }}>
      {Array.from({ length: n }).map((_, i) => {
        const off = i - mid
        const shift = Math.round((1 - (off / (mid || 1)) ** 2) * 5) // bow toward centre
        return (
          <span
            key={i}
            className="absolute left-1/2 top-0"
            style={{
              top: i * step,
              transform: `translateX(calc(-50% + ${dir * shift}px)) rotate(${90 + dir * off * arcPer}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <CardBack w={w} />
          </span>
        )
      })}
    </span>
  )
}
