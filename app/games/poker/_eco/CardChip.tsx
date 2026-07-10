import type { Card, Rank, Suit } from '@/lib/games/poker/types'
import { SUIT_LABEL, isCourtRank, rankLabel, suitColor } from '@/lib/games/poker/cardArt'
import { SuitPip, CourtFigure, COURT_INSET } from '../_components/cardArt'

// ── History / replay card face — standard playing-card look ────────────────────────────────────
// Display-only card used by the hand replay (history page renders in the LIGHT site theme, NOT the
// dark .poker-root). It reuses the SHARED card art (SuitPip + JQK CourtFigure) so replay cards are
// identical to the live table: number cards centre a suit pip, J/Q/K centre the mirrored court
// figure. Suits are ALWAYS inline SVG (never OS emoji), and colour is never the only signal — every
// card shows the rank glyph + the suit shape.

// card width in px per size; height derives from the true 5:7 playing-card ratio.
const WIDTH: Record<'sm' | 'md', number> = { sm: 30, md: 40 }

// Pure presentational card (rank + suit). Used by replay / hand detail. Display only.
export function CardChip({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' }) {
  const rank = card.slice(0, -1) as Rank
  const suit = card.slice(-1) as Suit
  const known = suit === 's' || suit === 'c' || suit === 'd' || suit === 'h'
  const color = suitColor(suit)

  const court = isCourtRank(rank)
  const w = WIDTH[size]
  const h = Math.round(w * 1.4)
  const rankSize = Math.round(w * 0.36)
  // Court cards use a smaller, corner-hugging pip so it clears the framed J/Q/K figure.
  const cornerSuit = Math.round(w * (court ? 0.16 : 0.22))
  const cornerAlign = court ? 'items-start' : 'items-center'
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
    <span className={`flex flex-col ${cornerAlign} leading-[0.82]`}>
      <span className="font-black" style={{ fontSize: rankSize }}>
        {rankLabel(rank)}
      </span>
      <SuitPip suit={suit} size={cornerSuit} color={color} />
    </span>
  )

  return (
    <span
      role="img"
      aria-label={`${rankLabel(rank)} of ${SUIT_LABEL[suit]}`}
      className="relative inline-flex select-none overflow-hidden rounded-md border border-line bg-white leading-none shadow-sm"
      style={{ width: w, height: h, color }}
    >
      <span className="absolute z-10 flex flex-col items-center" style={{ top: padY, left: padX }}>
        {index}
      </span>
      {court ? (
        <span className="absolute" style={{ inset: COURT_INSET }} aria-hidden>
          <CourtFigure rank={rank} suit={suit} />
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <SuitPip suit={suit} size={centerSuit} color={color} />
        </span>
      )}
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
