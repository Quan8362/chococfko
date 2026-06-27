'use client'

import { RANKS, R2, type Card } from '@/lib/games/tlmn/engine'

// ── Court figures (J/Q/K) — vendored open-license artwork ────────────────────────────
// NOTE(asset): the J/Q/K central FIGURE illustrations live in
// public/games/tlmn/cards/<RANK><SUIT>.svg and come from Byron Knoll's PUBLIC-DOMAIN
// "Vector Playing Cards" deck (github.com/notpeter/Vector-Playing-Cards). Each was
// cropped (viewBox) to the figure box so the source deck's OWN border + indices are
// gone and only OUR uniform corner index shows. See cards/LICENSE.txt. The number
// cards 2–10 + Ace below are custom inline SVG (not from that deck).
const COURT_RANK = ['J', 'Q', 'K'] as const // RANKS index 8,9,10
const SUIT_CODE = ['S', 'C', 'D', 'H'] as const // matches SUITS in engine.ts
// How far the court figure sits inside the shared frame, so OUR corner index keeps a
// clear white margin. Tuned so J/Q/K read naturally and never collide with the index.
const COURT_INSET = '17.5% 16%'

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
// Run 6 — true playing-card red for ♥♦ (casino look), near-black for ♠♣.
const CARD_RED = '#d32f2f'

function SuitPip({ suit, size, color }: { suit: number; size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <path d={SUIT_PATH[suit]} />
    </svg>
  )
}

// Ace centre — a larger ornamental pip framed by a thin laurel-style double ring so the
// Ace reads as special (the Ace of Spades gets the grandest pip). One opaque face.
function AcePip({ suit, w, color }: { suit: number; w: number; color: string }) {
  const isSpade = suit === 0
  const ring = Math.round(w * (isSpade ? 0.66 : 0.6))
  const pip = Math.round(w * (isSpade ? 0.4 : 0.36))
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: ring, height: ring }}>
      <svg viewBox="0 0 100 100" width={ring} height={ring} aria-hidden className="absolute inset-0" style={{ stroke: color, fill: 'none', opacity: 0.5 }}>
        <circle cx="50" cy="50" r="46" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="40" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
      <SuitPip suit={suit} size={pip} color={color} />
    </span>
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
  const isCourt = card.rank >= 8 && card.rank <= 10 // J, Q, K
  const isAce = card.rank === 11
  const h = Math.round(w * 1.4) // 5:7
  const rank = RANKS[card.rank]
  const color = red ? CARD_RED : INK
  // ONE clean opaque face, UNIFORM across the whole deck: a bold corner index (rank
  // over a small suit pip) mirrored 180°. The CENTRE differs by rank only:
  //   2–10 → one large central pip · Ace → a larger ornamental pip · J/Q/K → the
  //   vendored court figure. Sizes are tuned so the index never overlaps the centre.
  const rankSize = Math.round(w * 0.3)
  const cornerSuit = Math.round(w * 0.18)
  const centerSuit = Math.round(w * 0.46)

  const corner = (
    <>
      <span className="font-black" style={{ fontSize: rankSize }}>{rank}</span>
      <SuitPip suit={card.suit} size={cornerSuit} color={color} />
    </>
  )

  return (
    <span
      className={[
        'relative inline-flex flex-col select-none rounded-[7px] bg-white leading-none transition-all duration-150 overflow-hidden',
        interactive && !dim ? 'tlmn-card-int' : '',
        selected
          ? 'ring-2 ring-rose shadow-[0_10px_22px_-6px_rgba(214,0,108,0.6)]'
          : playable && !dim
            ? 'ring-[1.5px] ring-rose/55 shadow-card'
            : isHeo && !dim
              ? 'ring-1 ring-line shadow-[0_0_0_1.5px_rgba(201,154,61,0.55)]'
              : 'ring-1 ring-line shadow-card',
        raised ? '-translate-y-2' : '',
        // NOT-PLAYABLE dim: filter ONLY (grayscale + brightness), never opacity. The card
        // stays fully OPAQUE so the overlapping neighbour in the hand fan can't show
        // through it — opacity here is what produced the old "doubled/ghosted" card.
        dim ? 'grayscale-[0.65] brightness-[0.78] saturate-[0.85]' : '',
      ].join(' ')}
      style={{ width: w, height: h, color }}
    >
      {/* top-left corner — the UNIFORM index reused on every rank incl. courts */}
      <span className="absolute top-[3px] left-[4px] z-10 flex flex-col items-center leading-[0.85]">{corner}</span>

      {/* CENTRE — court figure OR a single opaque central pip (no translucent ghost) */}
      {isCourt ? (
        <span className="absolute pointer-events-none" style={{ inset: COURT_INSET }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/games/tlmn/cards/${COURT_RANK[card.rank - 8]}${SUIT_CODE[card.suit]}.svg`}
            alt=""
            aria-hidden
            draggable={false}
            className="w-full h-full object-contain select-none"
          />
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          {isAce
            ? <AcePip suit={card.suit} w={w} color={color} />
            : <SuitPip suit={card.suit} size={centerSuit} color={color} />}
        </span>
      )}

      {/* bottom-right corner (mirrored 180°) */}
      <span className="absolute bottom-[3px] right-[4px] z-10 flex flex-col items-center leading-[0.85] rotate-180">{corner}</span>

      {isHeo && !dim && (
        <span className="absolute top-[3px] right-[4px] z-10 text-gold" style={{ fontSize: Math.round(w * 0.22) }}>★</span>
      )}
    </span>
  )
}

// Face-down card back (Run 6) — a blue/indigo field with a clean geometric lattice,
// a gold double frame and a centred diamond monogram. Consistent radius/shadow with
// CardFace; clearly distinct from the deep-red felt and the white faces.
export function CardBack({ w = 30, className = '' }: { w?: number; className?: string }) {
  const h = Math.round(w * 1.4)
  return (
    <span
      className={`relative inline-block rounded-[6px] ring-1 ring-[#0c1a44]/60 shadow-card overflow-hidden ${className}`}
      style={{
        width: w,
        height: h,
        background:
          'radial-gradient(120% 120% at 50% 0%, #3a55c8 0%, #243b9c 45%, #16236b 100%)',
      }}
    >
      {/* fine geometric cross-lattice */}
      <span
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 6px)',
        }}
      />
      {/* gold double frame */}
      <span className="absolute inset-[2px] rounded-[4px] border" style={{ borderColor: 'rgba(227,178,60,0.7)' }} />
      <span className="absolute inset-[4px] rounded-[3px] border border-white/15" />
      {/* monogram */}
      <span className="absolute inset-0 flex items-center justify-center">
        <SuitPip suit={2} size={Math.round(w * 0.5)} color="rgba(246,217,137,0.92)" />
      </span>
    </span>
  )
}

// ── Distinct bot avatars (Run 6.3) ──────────────────────────────────────────────────
// Premium, on-theme medallions instead of generic smileys: a jewel-tone gradient disc
// with a gold inner ring, a soft top sheen, and a single bold SUIT emblem. Each bot gets
// a distinct hue + suit (garnet ♠ / emerald ♥ / amethyst ♦ / sapphire ♣), so Bot 1/2/3/4
// are instantly distinguishable and stay consistent across rounds (deterministic by
// seed = seat index). Vector + lightweight; sits cleanly on the green/red felt under the
// existing gold frame ring + active glow.
// TODO(asset): bot avatars can be swapped for commissioned illustrated mascots later.
const BOT_THEMES = [
  { c1: '#c0314b', c2: '#6e0f22', suit: 0, ink: '#f6d989' }, // garnet · spade · gold
  { c1: '#1f8a57', c2: '#0f4a2c', suit: 3, ink: '#ffe1ea' }, // emerald · heart · blush
  { c1: '#8a4ec0', c2: '#46226b', suit: 2, ink: '#f6d989' }, // amethyst · diamond · gold
  { c1: '#2a8aa6', c2: '#0e4150', suit: 1, ink: '#eaf6ff' }, // sapphire · club · ice
] as const
export function BotAvatar({ seed, size = 46 }: { seed: number; size?: number }) {
  const i = ((seed % BOT_THEMES.length) + BOT_THEMES.length) % BOT_THEMES.length
  const th = BOT_THEMES[i]
  const gid = `bota-${i}`
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ display: 'block', borderRadius: '9999px' }}>
      <defs>
        <radialGradient id={gid} cx="50%" cy="30%" r="82%">
          <stop offset="0%" stopColor={th.c1} />
          <stop offset="100%" stopColor={th.c2} />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${gid})`} />
      {/* soft top sheen for depth */}
      <ellipse cx="24" cy="13" rx="15" ry="8" fill="#ffffff" opacity="0.12" />
      {/* gold inner ring */}
      <circle cx="24" cy="24" r="20.5" fill="none" stroke="rgba(246,217,137,0.5)" strokeWidth="1.2" />
      {/* bold suit emblem (24×24 path centred + scaled) */}
      <g transform="translate(24 24.5) scale(0.82) translate(-12 -12)">
        <path d={SUIT_PATH[th.suit]} fill={th.ink} />
      </g>
    </svg>
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
