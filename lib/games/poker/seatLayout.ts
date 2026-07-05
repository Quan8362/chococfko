// ── Poker table seat geometry — PURE, the single source of truth for layout ─────────────
//
// PURE module (no React, no DOM, no Supabase) so every placement rule is a unit-testable fact.
// The visual-spec demands explicit seat maps for 2/3/4/5/6 players across THREE landscape
// layouts (desktop / tablet / mobile), the local player always anchored at the primary bottom
// position, occupied seats redistributed so an empty seat never breaks the ring, and ALL
// geometry centralized here (no magic numbers scattered across components).
//
// Coordinates are PERCENTAGES of the BACKGROUND ART image (0..100 on each axis), never raw
// pixels — the table re-fits at any size and the component maps these onto the actual rendered
// image rectangle (see TableBackground's cover-box), so a seat anchored to a rail pad in the art
// stays glued to that pad at every viewport size / aspect ratio. Each anchor carries TWO points:
//   • the SEAT pad   — where the player pod (avatar / name / stack) or the "sit here" button sits,
//                      on the leather rail pad of the art.
//   • the CARD pocket — where that seat's hole cards render, in the felt recess in front of the
//                      seat (just inboard of the rail, beside the cup-holder), toward the board.
// This split is the fix for "sit button floats in the felt, cards buried in the pod": the pod goes
// on the pad, the cards go in the pocket.
//
// Orientation model: visual position 0 is ALWAYS the bottom "hero" anchor. A seated viewer owns
// that band (their cards + action bar live in the bottom overlay), so their ring pod is not drawn
// in the ring and the remaining occupied seats fill positions 1..C-1 around the arc. A spectator
// has no hero, so every physical seat renders at its own anchor (identity), bottom included.

export type PokerTableLayout = 'desktop' | 'tablet' | 'mobile'

export const POKER_MIN_CAPACITY = 2
export const POKER_MAX_CAPACITY = 6

// A single seat anchor, as a percentage of the background-art image.
export interface SeatAnchor {
  readonly xPct: number
  readonly yPct: number
  // pos 0 (bottom) — the hero band. A seated viewer renders their local area in the bottom overlay.
  readonly isHero: boolean
}

// The complete geometry for one (capacity, layout) pair: where each VISUAL position's pod sits,
// where its cards sit, where the board/pot centre sits, and the presentation scales.
export interface TableGeometry {
  readonly capacity: number
  readonly layout: PokerTableLayout
  // Indexed by VISUAL position (0 = hero/bottom). Pod anchors (rail pads).
  readonly seats: readonly SeatAnchor[]
  // Indexed by VISUAL position. Card-pocket anchors (felt recess in front of each seat).
  readonly pockets: readonly SeatAnchor[]
  // Board + pot centre (slightly above the geometric middle so the bottom hero band never
  // collides with the community cards).
  readonly center: { readonly xPct: number; readonly yPct: number }
  // Community-card width in px and per-layout pod / card scales, tuned so the tablet/mobile assets
  // are used at a sensible density instead of a shrunk desktop table.
  readonly boardCardW: number
  readonly seatAvatarSize: number
  readonly pocketCardW: number
  readonly compactSeats: boolean
}

// ── Station tables — measured from the three table-art assets ────────────────────────────────
// Each station is { pad: [x,y], pocket: [x,y] } as a % of that layout's art image. Position 0 is
// the hero (bottom). The art is an 8-position table (2 top pads, 2 bottom pads, 2 left + 2 right
// cup-holder rails); we map 2..6 players onto real pads, symmetric about the vertical axis. Even
// counts (4, 6) use the corner pads (no seat lands in the top/bottom centre gap between pads);
// odd counts (3, 5) and heads-up (2) put the axis seat on the rail centre.
type Station = readonly [padX: number, padY: number, pocketX: number, pocketY: number]

interface LayoutStations {
  readonly center: { xPct: number; yPct: number }
  readonly boardCardW: number
  readonly seatAvatarSize: number
  readonly pocketCardW: number
  readonly compactSeats: boolean
  readonly byCapacity: Record<number, readonly Station[]>
}

// Desktop + mobile share the near-top-down 16:9 art (same framing), so they reuse one station map;
// only the presentation density differs. Tablet is the 4:3 perspective art (table sits higher, so
// the bottom pads are pulled up and the left/right rails are tighter).
const DESKTOP_STATIONS: Record<number, readonly Station[]> = {
  // heads-up: hero bottom-centre, villain top-centre
  2: [
    [50, 74, 50, 64],
    [50, 20, 50, 31],
  ],
  // 3-max: hero bottom-centre + two top pads
  3: [
    [50, 74, 50, 64],
    [34, 27, 40, 35],
    [66, 27, 60, 35],
  ],
  // 4-max: the four corner pads (no centre-gap seats). The bottom pads sit further OUTWARD than
  // the top pads (the art's bottom rail is wider in perspective), so they land on the chairs.
  4: [
    [30.5, 73, 37, 64],
    [33, 27, 39, 35],
    [67, 27, 61, 35],
    [69.5, 73, 63, 64],
  ],
  // 5-max: hero bottom-centre + left + two top pads + right
  5: [
    [50, 75, 50, 65],
    [12, 50, 24, 50],
    [33, 26, 39, 34],
    [67, 26, 61, 34],
    [88, 50, 76, 50],
  ],
  // 6-max: bottom-left, left, top-left, top-right, right, bottom-right — all on real rail pads
  6: [
    [30.5, 73, 37, 64],
    [12, 50, 24, 50],
    [33, 26, 40, 34],
    [67, 26, 60, 34],
    [88, 50, 76, 50],
    [69.5, 73, 63, 64],
  ],
}

const TABLET_STATIONS: Record<number, readonly Station[]> = {
  2: [
    [50, 64, 50, 55],
    [50, 22, 50, 32],
  ],
  3: [
    [50, 64, 50, 55],
    [34, 30, 40, 36],
    [66, 30, 60, 36],
  ],
  4: [
    [33, 63, 39, 54],
    [33, 30, 39, 36],
    [67, 30, 61, 36],
    [67, 63, 61, 54],
  ],
  5: [
    [50, 64, 50, 55],
    [11, 45, 22, 45],
    [33, 30, 39, 36],
    [67, 30, 61, 36],
    [89, 45, 78, 45],
  ],
  6: [
    [33, 62, 39, 54],
    [11, 45, 22, 45],
    [33, 30, 39, 36],
    [67, 30, 61, 36],
    [89, 45, 78, 45],
    [67, 62, 61, 54],
  ],
}

// Mobile shares the 16:9 art dimensions but its render frames the table a touch higher/smaller
// than the desktop asset, so the bottom pads sit higher and the ring is slightly tighter.
const MOBILE_STATIONS: Record<number, readonly Station[]> = {
  2: [
    [50, 70, 50, 61],
    [50, 20, 50, 31],
  ],
  3: [
    [50, 70, 50, 61],
    [34, 28, 40, 36],
    [66, 28, 60, 36],
  ],
  4: [
    [30.5, 69, 37, 61],
    [34, 28, 39, 36],
    [66, 28, 61, 36],
    [69.5, 69, 63, 61],
  ],
  5: [
    [50, 71, 50, 62],
    [12, 49, 24, 49],
    [34, 27, 39, 35],
    [66, 27, 61, 35],
    [88, 49, 76, 49],
  ],
  6: [
    [30.5, 69, 37, 61],
    [12, 49, 24, 49],
    [34, 27, 40, 35],
    [66, 27, 60, 35],
    [88, 49, 76, 49],
    [69.5, 69, 63, 61],
  ],
}

const STATIONS: Record<PokerTableLayout, LayoutStations> = {
  desktop: {
    center: { xPct: 50, yPct: 45 },
    boardCardW: 54,
    seatAvatarSize: 50,
    pocketCardW: 34,
    compactSeats: false,
    byCapacity: DESKTOP_STATIONS,
  },
  tablet: {
    center: { xPct: 50, yPct: 42 },
    boardCardW: 46,
    seatAvatarSize: 46,
    pocketCardW: 30,
    compactSeats: false,
    byCapacity: TABLET_STATIONS,
  },
  mobile: {
    center: { xPct: 50, yPct: 44 },
    boardCardW: 34,
    seatAvatarSize: 40,
    pocketCardW: 26,
    compactSeats: true,
    byCapacity: MOBILE_STATIONS,
  },
}

function clampCapacity(capacity: number): number {
  if (!Number.isFinite(capacity)) return POKER_MAX_CAPACITY
  return Math.max(POKER_MIN_CAPACITY, Math.min(POKER_MAX_CAPACITY, Math.round(capacity)))
}

// Anchor coordinates (pod pads) for every VISUAL position of a (capacity, layout). Position 0 is
// the bottom hero anchor. PURE: deterministic, no I/O.
export function seatAnchors(capacity: number, layout: PokerTableLayout): SeatAnchor[] {
  const c = clampCapacity(capacity)
  const stations = STATIONS[layout].byCapacity[c]
  return stations.map((s, i) => ({ xPct: s[0], yPct: s[1], isHero: i === 0 }))
}

// Card-pocket anchors (indexed by VISUAL position) — where each seat's hole cards render.
export function pocketAnchors(capacity: number, layout: PokerTableLayout): SeatAnchor[] {
  const c = clampCapacity(capacity)
  const stations = STATIONS[layout].byCapacity[c]
  return stations.map((s, i) => ({ xPct: s[2], yPct: s[3], isHero: i === 0 }))
}

// The full geometry bundle for a (capacity, layout).
export function tableGeometry(capacity: number, layout: PokerTableLayout): TableGeometry {
  const c = clampCapacity(capacity)
  const l = STATIONS[layout]
  return {
    capacity: c,
    layout,
    seats: seatAnchors(c, layout),
    pockets: pocketAnchors(c, layout),
    center: l.center,
    boardCardW: l.boardCardW,
    seatAvatarSize: l.seatAvatarSize,
    pocketCardW: l.pocketCardW,
    compactSeats: l.compactSeats,
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

// Convenience: the pad anchor a given physical seat should render at, for this viewer + layout.
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

// Convenience: the card-pocket anchor a given physical seat should render at.
export function pocketForSeat(
  physicalSeat: number,
  viewerSeat: number | null,
  capacity: number,
  layout: PokerTableLayout,
): SeatAnchor {
  const anchors = pocketAnchors(capacity, layout)
  const pos = visualPosition(physicalSeat, viewerSeat, capacity)
  return anchors[pos]
}
