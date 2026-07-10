// ── Poker card art (React) — SuitPip + CourtFigure ──────────────────────────────────────────────
//
// The ONE place suit glyphs and JQK court figures are drawn. Both card renderers (the dark-table
// `PokerCard` and the light-history `CardChip`) import these so the deck is pixel-identical on every
// surface — and identical to the Tiến Lên Miền Nam deck, since the J/Q/K figures are the SAME
// vendored public-domain illustrations. Pure presentational inline SVG / <img> — no hooks, no state,
// no 'use client' — so it drops into server and client components alike. Data lives in
// `lib/games/poker/cardArt.ts`.

import type { Suit } from '@/lib/games/poker/types'
import {
  SPADE_PATH,
  DIAMOND_PATH,
  HEART_PATH,
  CLUB_GEOM,
  courtAssetSrc,
  type CourtRank,
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
// The vendored public-domain figure, filling its parent box (the card insets it so our corner index
// keeps a clear margin — see COURT_INSET in the card renderers). Decorative: the card's own
// role="img"/aria-label already names the card, so the figure is aria-hidden and leaks nothing.
export function CourtFigure({ rank, suit }: { rank: CourtRank; suit: Suit }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={courtAssetSrc(rank, suit)}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none h-full w-full select-none object-contain"
    />
  )
}

/** Inset for the court figure inside a card face, so J/Q/K never collide with the corner indices.
 *  Paired with the smaller, corner-hugging pip the card renderers use for court cards, this keeps a
 *  clear white gap between the rank/suit index and the framed J/Q/K illustration in every corner. */
export const COURT_INSET = '16% 24%'
