// ── Poker table seat geometry — PURE, the single source of truth for layout ─────────────
//
// PURE module (no React, no DOM, no Supabase) so every placement rule is a unit-testable fact.
// The visual-spec demands explicit seat maps for 2/3/4/5/6 players across THREE landscape
// layouts (desktop / tablet / mobile), the local player always anchored at the primary bottom
// position, occupied seats redistributed so an empty seat never breaks the ring, and ALL
// geometry centralized here (no magic numbers scattered across components).
//
// Coordinates are PERCENTAGES of the inner play area (0..100 on each axis), never raw pixels —
// the table re-fits at any size and the seat-positioning lesson from TLMN (never tie a seat to
// browser chrome) is respected by construction. The component places each pod with a
// translate(-50%,-50%) on top of these anchors.
//
// Orientation model: visual position 0 is ALWAYS the bottom-center "hero" anchor. A seated
// viewer owns that band (their cards + action bar live there), so their ring pod is rendered by
// the dedicated local area and the remaining occupied seats fill positions 1..C-1 around the
// upper arc and sides. A spectator has no hero, so every physical seat renders at its own anchor
// (identity), bottom included.

export type PokerTableLayout = 'desktop' | 'tablet' | 'mobile'

export const POKER_MIN_CAPACITY = 2
export const POKER_MAX_CAPACITY = 6

// A single seat anchor, as a percentage of the inner play area.
export interface SeatAnchor {
  readonly xPct: number
  readonly yPct: number
  // pos 0 (bottom-center) — the hero band. A seated viewer renders their local area here.
  readonly isHero: boolean
}

// The complete geometry for one (capacity, layout) pair: where each VISUAL position sits, where
// the board/pot centre sits, and the presentation scales the components should use.
export interface TableGeometry {
  readonly capacity: number
  readonly layout: PokerTableLayout
  // Indexed by VISUAL position (0 = hero/bottom, increasing clockwise around the ellipse).
  readonly seats: readonly SeatAnchor[]
  // Board + pot centre (slightly above the geometric middle so the bottom hero band never
  // collides with the community cards).
  readonly center: { readonly xPct: number; readonly yPct: number }
  // Community-card width in px and a multiplier for seat-pod sizing, tuned per layout so the
  // tablet/mobile assets are used at a sensible density instead of a shrunk desktop table.
  readonly boardCardW: number
  readonly seatAvatarSize: number
  readonly compactSeats: boolean
}

// ── Ellipse parameters per layout ─────────────────────────────────────────────────────────
// Seats sit on an ellipse inscribed in the play area. Each layout has its own ellipse + centre +
// scales (separate geometry per layout, as the spec requires). The mobile ellipse is wider and
// shorter (16:9 landline-locked asset) and leaves more headroom at the very bottom for the
// action band; the tablet ellipse is rounder (4:3 asset).
interface LayoutEllipse {
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly center: { xPct: number; yPct: number }
  readonly boardCardW: number
  readonly seatAvatarSize: number
  readonly compactSeats: boolean
}

const ELLIPSE: Record<PokerTableLayout, LayoutEllipse> = {
  desktop: { cx: 50, cy: 45, rx: 40, ry: 35, center: { xPct: 50, yPct: 41 }, boardCardW: 54, seatAvatarSize: 54, compactSeats: false },
  tablet: { cx: 50, cy: 45, rx: 38, ry: 37, center: { xPct: 50, yPct: 42 }, boardCardW: 46, seatAvatarSize: 50, compactSeats: false },
  mobile: { cx: 50, cy: 43, rx: 44, ry: 31, center: { xPct: 50, yPct: 39 }, boardCardW: 34, seatAvatarSize: 42, compactSeats: true },
}

// ── Per-capacity seat angles (screen degrees: 0 = right, 90 = bottom, 180 = left, 270 = top) ──
// Position 0 is fixed at 90° (bottom-center). The rest are arranged symmetrically about the
// vertical axis so the ring reads as balanced for every player count — never visually broken.
// Increasing position walks clockwise on screen.
const SEAT_ANGLES: Record<number, readonly number[]> = {
  2: [90, 270], //                       hero ↓ , opponent ↑
  3: [90, 210, 330], //                  hero, upper-left, upper-right
  4: [90, 180, 270, 0], //               hero, left, top, right
  5: [90, 162, 234, 306, 18], //         hero, left, upper-left, upper-right, right
  6: [90, 150, 210, 270, 330, 30], //    hero, lower-left, upper-left, top, upper-right, lower-right
}

function clampCapacity(capacity: number): number {
  if (!Number.isFinite(capacity)) return POKER_MAX_CAPACITY
  return Math.max(POKER_MIN_CAPACITY, Math.min(POKER_MAX_CAPACITY, Math.round(capacity)))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Anchor coordinates for every VISUAL position of a (capacity, layout). Position 0 is the bottom
// hero anchor. PURE: deterministic, no I/O.
export function seatAnchors(capacity: number, layout: PokerTableLayout): SeatAnchor[] {
  const c = clampCapacity(capacity)
  const e = ELLIPSE[layout]
  const angles = SEAT_ANGLES[c]
  return angles.map((deg, i) => {
    const rad = (deg * Math.PI) / 180
    return {
      xPct: round1(e.cx + e.rx * Math.cos(rad)),
      yPct: round1(e.cy + e.ry * Math.sin(rad)),
      isHero: i === 0,
    }
  })
}

// The full geometry bundle for a (capacity, layout).
export function tableGeometry(capacity: number, layout: PokerTableLayout): TableGeometry {
  const c = clampCapacity(capacity)
  const e = ELLIPSE[layout]
  return {
    capacity: c,
    layout,
    seats: seatAnchors(c, layout),
    center: e.center,
    boardCardW: e.boardCardW,
    seatAvatarSize: e.seatAvatarSize,
    compactSeats: e.compactSeats,
  }
}

// ── Visual-position mapping (the "rotate so I'm at the bottom" rule) ─────────────────────────
// Map a PHYSICAL seat index (0..capacity-1, the DB seat) to its VISUAL position (0..capacity-1)
// for a given viewer. The viewer always maps to position 0 (the bottom hero band); every other
// seat keeps its clockwise distance from the viewer, so the relative ring order is preserved.
// A spectator (viewerSeat === null) gets the identity mapping (physical 0 stays at the bottom).
export function visualPosition(
  physicalSeat: number,
  viewerSeat: number | null,
  capacity: number,
): number {
  const c = clampCapacity(capacity)
  const s = ((Math.trunc(physicalSeat) % c) + c) % c
  if (viewerSeat === null) return s
  const v = ((Math.trunc(viewerSeat) % c) + c) % c
  return (s - v + c) % c
}

// Convenience: the anchor a given physical seat should render at, for this viewer + layout.
export function anchorForSeat(
  physicalSeat: number,
  viewerSeat: number | null,
  capacity: number,
  layout: PokerTableLayout,
): SeatAnchor {
  const anchors = seatAnchors(capacity, layout)
  const pos = visualPosition(physicalSeat, viewerSeat, capacity)
  return anchors[pos]
}
