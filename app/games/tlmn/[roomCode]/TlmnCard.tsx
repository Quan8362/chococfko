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
// Bumped (Run — card polish) in step with the larger corner inset below so the figure
// keeps a premium, un-squeezed margin from the now-roomier indices.
const COURT_INSET = '18% 16.5%'

// ── Suit pips as inline SVG ──────────────────────────────────────────────────────
// Clean, SYMMETRIC playing-card suit shapes authored in a SHARED square 48×48 viewBox
// and scaled UNIFORMLY (width === height) so hearts/clubs stay round and nothing is
// stretched. Inline vector (never the OS emoji renderer, which turns ♥♦ into coloured
// glyphs and breaks the brand red). Solid nonzero-winding fill — no holes / fill-rule
// tricks / chunky icon bases — so each pip is razor-crisp at the large central pip, the
// small corner index AND the tiny opponent minis. Index = suit: ♠ bích(0), ♣ chuồn(1),
// ♦ rô(2), ♥ cơ(3) — matches SUITS in engine.ts.
const SPADE_PATH =
  'M24 5C24 5 9 16 9 27 9 32 12 35 16 35 18.5 35 20.5 34 22 32.5 21.5 36 20 39.5 17 42L31 42C28 39.5 26.5 36 26 32.5 27.5 34 29.5 35 32 35 36 35 39 32 39 27 39 16 24 5 24 5Z'
const DIAMOND_PATH = 'M24 3 41 24 24 45 7 24Z'
// Balanced, symmetric heart authored in the shared 48×48 viewBox: bbox 34 wide × 36 tall,
// centred on (24,24) so it scales/positions identically on cards, pips AND the bot medallion
// (the old path was 40×36 — visibly wide/flattened, "méo", at the large avatar size).
const HEART_PATH =
  'M24 42C24 42 7 30 7 17 7 10.8 11.6 6 16.5 6 20 6 22.8 8.3 24 11.2 25.2 8.3 28 6 31.5 6 36.4 6 41 10.8 41 17 41 30 24 42 24 42Z'

const INK = '#1a1a1a'
// Run 6 — true playing-card red for ♥♦ (casino look), near-black for ♠♣.
const CARD_RED = '#d32f2f'

// The suit's inner geometry, drawn in the shared 48×48 viewBox. The club is composed of
// three TRUE circles + a flared stem (all the same solid fill → a clean union with
// perfectly round lobes) instead of an approximate single path.
function SuitGlyph({ suit }: { suit: number }) {
  if (suit === 1) {
    return (
      <>
        <circle cx="24" cy="15" r="8.4" />
        <circle cx="14.6" cy="27.4" r="8.4" />
        <circle cx="33.4" cy="27.4" r="8.4" />
        <path d="M20.4 28C21 33.4 19 38.5 14.5 42L33.5 42C29 38.5 27 33.4 27.6 28Z" />
      </>
    )
  }
  return <path d={suit === 0 ? SPADE_PATH : suit === 2 ? DIAMOND_PATH : HEART_PATH} />
}

function SuitPip({ suit, size, color }: { suit: number; size: number; color: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <SuitGlyph suit={suit} />
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
//   selected     — NO border/ring/underline: the card keeps its normal hairline edge and
//                  gains only a soft NEUTRAL drop shadow for separation; the upward lift is
//                  applied by the parent (a card-game pickup feel, not a form-field outline)
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
  const rankSize = Math.round(w * 0.295)
  const cornerSuit = Math.round(w * 0.17)
  const centerSuit = Math.round(w * 0.46)
  // Breathing room between the card edge and the corner index — proportional to the card
  // so it stays balanced at every size (fanned hand → large play). Tuned so the rank + suit
  // pip sit at the OUTER edge of the white field, near the corner (just clear of the ring),
  // not drifting toward the centre. (Run — card polish.)
  const padX = Math.max(2, Math.round(w * 0.05))
  const padY = Math.max(2, Math.round(w * 0.035))

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
          ? 'ring-1 ring-line shadow-[0_12px_22px_-8px_rgba(0,0,0,0.55)]'
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
      <span className="absolute z-10 flex flex-col items-center leading-[0.85]" style={{ top: padY, left: padX }}>{corner}</span>

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
      <span className="absolute z-10 flex flex-col items-center leading-[0.85] rotate-180" style={{ bottom: padY, right: padX }}>{corner}</span>
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
// a distinct hue + suit (garnet ♠ / emerald ♠ / amethyst ♦ / sapphire ♣), so Bot 1/2/3/4
// are instantly distinguishable and stay consistent across rounds (deterministic by
// seed = seat index). Vector + lightweight; sits cleanly on the green/red felt under the
// existing gold frame ring + active glow.
// Suit index: ♠ spade(0), ♣ club(1), ♦ diamond(2), ♥ heart(3) — matches SUITS in engine.ts.
// Indexed by seat_index (stable player identity): seat 0 = human dock, so the bot suits are
// seat 1 → ♠ (Bot 1), seat 2 → ♦ (Bot 2), seat 3 → ♣ (Bot 3).
// TODO(asset): bot avatars can be swapped for commissioned illustrated mascots later.
// Ordered by bot number (index 0 = Bot 1): the suit emblem is a fixed identity —
// Bot 1 → spade · Bot 2 → diamond · Bot 3 → club · Bot 4 → heart (suit ids: 0 spade,
// 1 club, 2 diamond, 3 heart). Pass botThemeIndex(name, seat) as `seed` (see avatar.ts).
const BOT_THEMES = [
  { c1: '#c0314b', c2: '#6e0f22', suit: 0, ink: '#f6d989' }, // Bot 1 · garnet · spade · gold
  { c1: '#8a4ec0', c2: '#46226b', suit: 2, ink: '#f6d989' }, // Bot 2 · amethyst · diamond · gold
  { c1: '#2a8aa6', c2: '#0e4150', suit: 1, ink: '#eaf6ff' }, // Bot 3 · sapphire · club · ice
  { c1: '#1f8a57', c2: '#0f4a2c', suit: 3, ink: '#ffe1ea' }, // Bot 4 · emerald · heart · blush
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
      {/* bold suit emblem (shared 48×48 glyph, centred + scaled) */}
      <g transform="translate(24 24) scale(0.62) translate(-24 -24)" fill={th.ink}>
        <SuitGlyph suit={th.suit} />
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
// Decorative cap on the number of face-down backs actually drawn. The EXACT remaining-card
// count is always shown by the upright badge beside the avatar, so the fan is purely a
// "hand of cards" motif — capping it keeps every opponent pod compact (especially the
// VERTICAL side fans, which otherwise tower ~90px for a 12–13 card hand and dwarf the
// avatar, making the name plate below look detached). No gameplay information is lost.
const FAN_SHOWN = 7

export function OpponentFan({
  count, w, orientation,
}: { count: number; w: number; orientation: 'top' | 'left' | 'right' }) {
  const n = Math.min(Math.max(count, 0), FAN_SHOWN)
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
