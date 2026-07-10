// ── Poker card art (React) — SuitPip + CourtFigure ──────────────────────────────────────────────
//
// The ONE place suit glyphs and JQK court figures are drawn. Both card renderers (the dark-table
// `PokerCard` and the light-history `CardChip`) import these so the deck is pixel-identical on every
// surface. Pure presentational inline SVG — no hooks, no state, no 'use client' — so it drops into
// server and client components alike. Geometry lives in `lib/games/poker/cardArt.ts`.

import type { Suit } from '@/lib/games/poker/types'
import {
  SPADE_PATH,
  DIAMOND_PATH,
  HEART_PATH,
  CLUB_GEOM,
  courtFigure,
  suitColor,
  type CourtRank,
  type CourtRole,
} from '@/lib/games/poker/cardArt'

// ── Suit pip ─────────────────────────────────────────────────────────────────────────────────────
function SuitGlyph({ suit }: { suit: Suit }) {
  if (suit === 'c') {
    return (
      <>
        {CLUB_GEOM.circles.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
        ))}
        <path d={CLUB_GEOM.stem} />
      </>
    )
  }
  return <path d={suit === 's' ? SPADE_PATH : suit === 'd' ? DIAMOND_PATH : HEART_PATH} />
}

export function SuitPip({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <SuitGlyph suit={suit} />
    </svg>
  )
}

// ── Court figure (J / Q / K) ─────────────────────────────────────────────────────────────────────
// Warm two-tone palette that reads inside the black-and-gold lounge. `robe` is the suit colour, so a
// heart/diamond court is red-robed and a spade/club court is ink-robed — the suit is legible from the
// figure itself, reinforced by the real suit glyph at the anchor.
const IVORY = '#f7edd8'
const HAIR = '#6b4f3a'
const GOLD = '#d9b45f'
const GOLD_DARK = '#a9812f'
const OUTLINE = 'rgba(26,23,20,0.55)'

function roleFill(role: CourtRole, robe: string): string {
  switch (role) {
    case 'robe':
      return robe
    case 'skin':
      return IVORY
    case 'hair':
      return HAIR
    case 'gold':
      return GOLD
    case 'goldDark':
      return GOLD_DARK
  }
}

// One half of the figure (top). The parent mirrors it 180° about (50,76) for the reversible half.
function CourtHalf({ rank, suit, robe }: { rank: CourtRank; suit: Suit; robe: string }) {
  const spec = courtFigure(rank)
  const pip = suitColor(suit)
  return (
    <g>
      {spec.shapes.map((s, i) => {
        const fill = roleFill(s.role, robe)
        const outline = s.outline ? OUTLINE : undefined
        if (s.tag === 'circle') {
          return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fill} stroke={outline} strokeWidth={outline ? 0.8 : undefined} />
        }
        if (s.stroke) {
          return <path key={i} d={s.d} fill="none" stroke={fill} strokeWidth={2.4} strokeLinecap="round" />
        }
        return <path key={i} d={s.d} fill={fill} stroke={outline} strokeWidth={outline ? 0.8 : undefined} strokeLinejoin="round" />
      })}
      {/* The real suit glyph, integrated into the figure (bloom head / sceptre cap). */}
      <g transform={`translate(${spec.suitAnchor.x - spec.suitAnchor.size / 2} ${spec.suitAnchor.y - spec.suitAnchor.size / 2}) scale(${spec.suitAnchor.size / 48})`}>
        <g fill={pip}>
          <SuitGlyph suit={suit} />
        </g>
      </g>
    </g>
  )
}

/**
 * A full mirrored court figure filling the centre panel of a face card. `size` is the rendered
 * width; the SVG keeps the 100×152 (≈5:7) court-panel ratio and scales down gracefully — the figure
 * is a bold silhouette, so it stays recognisable at compact gameplay sizes.
 */
export function CourtFigure({ rank, suit, size }: { rank: CourtRank; suit: Suit; size: number }) {
  const robe = suitColor(suit)
  return (
    <svg viewBox="0 0 100 152" width={size} height={size * 1.52} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      {/* thin gold rule across the mirror line, like a classic court card */}
      <line x1="14" y1="76" x2="86" y2="76" stroke={GOLD} strokeWidth="0.8" opacity="0.6" />
      <CourtHalf rank={rank} suit={suit} robe={robe} />
      <g transform="rotate(180 50 76)">
        <CourtHalf rank={rank} suit={suit} robe={robe} />
      </g>
    </svg>
  )
}
