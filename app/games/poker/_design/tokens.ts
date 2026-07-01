// ── Chợ Cóc FKO Poker — Design Tokens (single source of truth) ─────────────────────────
//
// PURE module: plain data only, no React, no DOM. These tokens describe the "Poker lounge"
// visual language — deep black / charcoal / dark leather / champagne-gold trim with controlled
// emerald, burgundy and navy accents, plus Chợ Cóc pink as a *subtle secondary* brand accent.
//
// The same values are mirrored as CSS custom properties in ./poker-theme.css (scoped under
// `.poker-root`) so both the CSS layer and the TS/SVG components stay in lockstep. When a value
// is needed inside inline SVG (gradients, chip faces) we read it from here; when it's needed for
// layout/colour in JSX we prefer the CSS var (`var(--pk-…)`) so a single theme edit propagates.
//
// This is deliberately NOT a re-skin of the warm cream/rose site theme — Poker has its own
// immersive dark identity. Site tokens (text-rose, bg-cream …) are never used on the felt.

// ── Palette ───────────────────────────────────────────────────────────────────────────────
export const palette = {
  // Surfaces — deep black → charcoal → leather, with dark-wood undertones.
  bgVoid: '#07060a', // page behind the table image (darkest)
  bgBase: '#0d0b11', // base app surface
  charcoal: '#16131b', // raised panels (action bar, sheets)
  charcoalHi: '#211c28', // hovered / elevated panel
  leather: '#241b18', // dark-leather rail accent
  wood: '#2a211b', // dark-wood undertone for trims
  feltDeep: '#0c2a22', // emerald felt, deep center
  feltMid: '#114534', // emerald felt, mid
  felt: '#123f31', // emerald felt, working green
  feltEdge: '#0a241c', // felt vignette edge

  // Champagne-gold trim (used sparingly — "too much gold" is explicitly avoided).
  gold: '#c9a14a', // primary champagne gold
  goldSoft: '#e6cf95', // light gold (text on dark)
  goldDeep: '#8a6d2c', // shadowed gold for bevels
  goldLine: 'rgba(201,161,74,0.35)', // hairline gold trim

  // Text.
  textHi: '#f4efe6', // primary text on dark
  textMid: '#c6bdb0', // secondary text
  textLow: '#8d8579', // tertiary / disabled
  textOnFelt: '#f0ece2', // text over the green felt (needs scrim)

  // Controlled accents.
  emerald: '#2f9e6f', // success / call / positive
  emeraldDeep: '#1c6b4a',
  burgundy: '#9d2b3f', // danger / fold / loss
  burgundyDeep: '#6e1c2c',
  navy: '#2d5b8e', // info / secondary action
  navyDeep: '#1c3c61',
  amber: '#d99836', // warning / time pressure
  amberDeep: '#a06d1f',

  // Chợ Cóc pink — SUBTLE secondary brand accent only (never the primary felt colour).
  pink: '#c2185b', // brand rose (matches site --rose)
  pinkSoft: '#e0607e',

  // Functional state colours (semantic, not raw hues).
  currentActor: '#e6cf95', // champagne ring for the seat to act
  allIn: '#d99836', // amber — committed
  fold: '#6e6258', // muted — folded out of the hand
  disconnected: '#9d2b3f', // burgundy — connection lost
  focus: '#7fb0e6', // keyboard focus ring (clear, high-contrast on dark)

  white: '#ffffff',
  black: '#000000',
} as const

// ── Chip denomination system ────────────────────────────────────────────────────────────────
// Each denomination has a strongly distinguishable colour, an edge-spot colour, and a compact
// label. Real casino conventions adapted to play-money "xu" magnitudes (up to billions). The
// numeric value is ALWAYS shown alongside the chip — colour is an *aid*, never the sole signal
// (accessibility: do not rely on colour alone).
export interface ChipDenom {
  readonly value: number
  readonly label: string // compact face label (e.g. "1K", "1M")
  readonly base: string // chip body colour
  readonly ring: string // outer ring / bevel
  readonly edge: string // edge-spot colour (the dashed inlay)
  readonly ink: string // denomination text colour on the chip face
}

// Ordered ascending. `chipBreakdown` walks this from the top to render a realistic stack.
export const CHIP_DENOMS: readonly ChipDenom[] = [
  { value: 1, label: '1', base: '#e9e4d8', ring: '#c9c2b2', edge: '#b3ab98', ink: '#241b18' },
  { value: 5, label: '5', base: '#9d2b3f', ring: '#6e1c2c', edge: '#f4efe6', ink: '#f4efe6' },
  { value: 25, label: '25', base: '#2f9e6f', ring: '#1c6b4a', edge: '#f4efe6', ink: '#f4efe6' },
  { value: 100, label: '100', base: '#211c28', ring: '#000000', edge: '#c9a14a', ink: '#e6cf95' },
  { value: 500, label: '500', base: '#5b3a8e', ring: '#3a2360', edge: '#e6cf95', ink: '#f0e9fb' },
  { value: 1_000, label: '1K', base: '#c9a14a', ring: '#8a6d2c', edge: '#241b18', ink: '#241b18' },
  { value: 5_000, label: '5K', base: '#b5562a', ring: '#7d3818', edge: '#f4efe6', ink: '#f9efe6' },
  { value: 25_000, label: '25K', base: '#2d5b8e', ring: '#1c3c61', edge: '#e6cf95', ink: '#eaf2fb' },
  { value: 100_000, label: '100K', base: '#c2185b', ring: '#8a1040', edge: '#f4efe6', ink: '#fdeef4' }, // pink accent
  { value: 1_000_000, label: '1M', base: '#1c6b4a', ring: '#0c3a28', edge: '#e6cf95', ink: '#e6f7ee' },
  { value: 25_000_000, label: '25M', base: '#3a2360', ring: '#1f1238', edge: '#e6cf95', ink: '#efe6fb' },
  { value: 500_000_000, label: '500M', base: '#7d1f2e', ring: '#4d1019', edge: '#e6cf95', ink: '#fbe9ec' },
] as const

// Greedy breakdown of an integer amount into denomination "columns" (highest first), capped so a
// rendered stack never explodes. Returns the denom + how many chips to draw (display-capped) and
// the true count. PURE integer math (coins are always integers — coin-model COIN-INT-001).
export interface ChipColumn {
  readonly denom: ChipDenom
  readonly drawCount: number // chips to actually render (display-capped)
  readonly trueCount: number // real number of chips of this denom
}

export function chipBreakdown(amount: number, opts?: { maxColumns?: number; maxPerColumn?: number }): ChipColumn[] {
  const maxColumns = opts?.maxColumns ?? 5
  const maxPerColumn = opts?.maxPerColumn ?? 6
  let remaining = Math.max(0, Math.floor(amount))
  const cols: ChipColumn[] = []
  for (let i = CHIP_DENOMS.length - 1; i >= 0 && cols.length < maxColumns; i--) {
    const denom = CHIP_DENOMS[i]
    if (remaining < denom.value) continue
    const trueCount = Math.floor(remaining / denom.value)
    remaining -= trueCount * denom.value
    cols.push({ denom, trueCount, drawCount: Math.min(trueCount, maxPerColumn) })
  }
  return cols
}

// ── Geometry / radius / spacing scale ─────────────────────────────────────────────────────
export const radius = {
  card: 8, // px — playing card corner
  chip: '50%',
  badge: 999,
  panel: 14,
  control: 12,
  pill: 999,
} as const

// 4px base spacing scale (matches the rest of the platform's rhythm).
export const space = {
  px: 1,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

// ── Typography ───────────────────────────────────────────────────────────────────────────────
// Body uses the platform sans (Be Vietnam Pro). Numerals are tabular so stacks/pots never
// reflow as digits change (`font-variant-numeric` is set globally on body). Sizes avoid "tiny
// text" — the smallest functional label is 12px.
export const type = {
  fontDisplay: 'var(--font-serif-display)',
  fontBody: 'var(--font-bvp)',
  // sizes (px)
  micro: 12, // smallest allowed functional label
  small: 13,
  body: 15,
  lead: 17,
  title: 22,
  display: 30,
} as const

// ── Elevation (shadows tuned for a dark room — depth without "oversized shadows") ──────────
export const elevation = {
  seat: '0 2px 10px rgba(0,0,0,0.45)',
  raised: '0 6px 22px rgba(0,0,0,0.55)',
  panel: '0 -8px 28px rgba(0,0,0,0.45)',
  chip: '0 2px 4px rgba(0,0,0,0.5)',
  goldGlow: '0 0 0 1px rgba(201,161,74,0.45), 0 4px 16px rgba(201,161,74,0.18)',
} as const

// ── Motion ──────────────────────────────────────────────────────────────────────────────────
// Durations in ms. Animations are PRESENTATION-ONLY and must never gate authoritative state
// (visual-spec D3). All consumers must also honour `prefers-reduced-motion` — the CSS layer
// neutralises these under that query; TS consumers should check `prefersReducedMotion()`.
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  deal: 260, // per-card deal
  chipSlide: 280, // chip → pot
  potPush: 420, // pot → winner
  ease: 'cubic-bezier(.22,.68,0,1.2)',
  easeOut: 'cubic-bezier(.2,.7,.2,1)',
} as const

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Suit metadata — inline SVG only (never OS emoji, which break suit colours on Windows; this is
// the same lesson as TLMN's card module). `red` flags ♥♦. Index order matches the SVG glyphs.
export const SUITS = {
  s: { id: 0, red: false, label: 'spades' },
  c: { id: 1, red: false, label: 'clubs' },
  d: { id: 2, red: true, label: 'diamonds' },
  h: { id: 3, red: true, label: 'hearts' },
} as const
export type SuitKey = keyof typeof SUITS
