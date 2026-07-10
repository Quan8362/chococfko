// ── Poker card art — single source of truth for suit glyphs + JQK court figures ────────────────
//
// PURE data + geometry, no React. Both card renderers import from here so the deck looks identical
// on every surface (dark lounge table, light history replay, learning pages). Keeping the geometry
// in `lib/` lets the framework-free `node --test` harness assert the art exists and that Jack,
// Queen and King are structurally distinct — the visual defect this module fixes.
//
// This module NEVER touches card values, ordering, deck generation or privacy — it only describes
// how a *known, already-revealed* card should be drawn. Face-down cards are handled by the card
// backs and never reach this code.

import type { Rank, Suit } from './types'

// True playing-card colours. Colour is never the ONLY signal — every card also shows its rank glyph
// and suit shape — but red must read red and black must read near-black (Global Rule / suit colour).
export const CARD_RED = '#c2253e' // ♥ ♦
export const CARD_INK = '#1a1714' // ♠ ♣

export function suitColor(suit: Suit): string {
  return suit === 'h' || suit === 'd' ? CARD_RED : CARD_INK
}

export const SUIT_LABEL: Record<Suit, string> = { s: 'spades', c: 'clubs', d: 'diamonds', h: 'hearts' }

/** The rank string as shown to a human: 'T' becomes '10', everything else is itself. */
export function rankLabel(rank: Rank): string {
  return rank === 'T' ? '10' : rank
}

// ── Suit glyph geometry (shared 48×48 viewBox so every suit scales uniformly) ────────────────────
// Clubs are three discs + a stem, so they carry their own primitive list; the point-suits are a
// single path.
export const SPADE_PATH =
  'M24 5C24 5 9 16 9 27 9 32 12 35 16 35 18.5 35 20.5 34 22 32.5 21.5 36 20 39.5 17 42L31 42C28 39.5 26.5 36 26 32.5 27.5 34 29.5 35 32 35 36 35 39 32 39 27 39 16 24 5 24 5Z'
export const DIAMOND_PATH = 'M24 3 41 24 24 45 7 24Z'
export const HEART_PATH =
  'M24 42C24 42 7 30 7 17 7 10.8 11.6 6 16.5 6 20 6 22.8 8.3 24 11.2 25.2 8.3 28 6 31.5 6 36.4 6 41 10.8 41 17 41 30 24 42 24 42Z'

export interface ClubGeom {
  readonly circles: readonly { cx: number; cy: number; r: number }[]
  readonly stem: string
}
export const CLUB_GEOM: ClubGeom = {
  circles: [
    { cx: 24, cy: 15, r: 8.4 },
    { cx: 14.6, cy: 27.4, r: 8.4 },
    { cx: 33.4, cy: 27.4, r: 8.4 },
  ],
  stem: 'M20.4 28C21 33.4 19 38.5 14.5 42L33.5 42C29 38.5 27 33.4 27.6 28Z',
}

// ── Court figures (J / Q / K) ───────────────────────────────────────────────────────────────────
//
// Each figure is an ORIGINAL, hand-authored heraldic bust drawn in the TOP half of a 100×76 region
// (x 0..100, centre axis x=50, base line y=76). The card renderer mirrors this group 180° about the
// point (50,76) to build the reversible lower half of a standard face card, and drops the real suit
// glyph in at `suitAnchor`. Figures are two-tone: a suit-coloured robe, an ivory face, warm-brown
// hair/beard, and a gold crown/cap — so they sit inside the black-and-gold lounge without cartoon
// colour. Distinctness is structural, not incidental:
//   • Jack  — a youthful page: soft cap with a single sweeping feather, clean chin, wide collar.
//   • Queen — a rounded pearl crown, long framing hair locks, holding a suit-marked bloom.
//   • King  — a tall cross-topped crown, full beard + moustache, holding a suit-marked sceptre.

export type CourtRank = 'J' | 'Q' | 'K'
export const COURT_RANKS: readonly CourtRank[] = ['J', 'Q', 'K']

export function isCourtRank(rank: string): rank is CourtRank {
  return rank === 'J' || rank === 'Q' || rank === 'K'
}

/** Fill roles → concrete colours are resolved by the renderer from the card's suit colour. */
export type CourtRole = 'robe' | 'skin' | 'hair' | 'gold' | 'goldDark'

export interface CourtShape {
  readonly tag: 'path' | 'circle'
  /** for tag === 'path' */
  readonly d?: string
  /** for tag === 'circle' */
  readonly cx?: number
  readonly cy?: number
  readonly r?: number
  readonly role: CourtRole
  /** draw a thin ink outline around the shape (used on the face + crown for definition). */
  readonly outline?: boolean
  /** render as a stroked line (open path with no fillable area, e.g. a stem/sceptre). */
  readonly stroke?: boolean
}

export interface CourtFigureSpec {
  readonly rank: CourtRank
  readonly kind: 'jack' | 'queen' | 'king'
  readonly shapes: readonly CourtShape[]
  /** where the renderer places the real suit glyph, in the 100×76 top-half coordinate space. */
  readonly suitAnchor: { readonly x: number; readonly y: number; readonly size: number }
}

// Shared bust base (shoulders + neck + face) so all three courts share proportions; collars differ.
const NECK: CourtShape = { tag: 'path', d: 'M44 50h12v10H44Z', role: 'skin', outline: true }
const FACE: CourtShape = { tag: 'path', d: 'M50 22C40 22 34 30 34 40 34 50 41 56 50 56 59 56 66 50 66 40 66 30 60 22 50 22Z', role: 'skin', outline: true }

const JACK: CourtFigureSpec = {
  rank: 'J',
  kind: 'jack',
  suitAnchor: { x: 24, y: 60, size: 15 },
  shapes: [
    // wide page collar + robe
    { tag: 'path', d: 'M16 76 20 60Q50 52 80 60L84 76Z', role: 'robe' },
    { tag: 'path', d: 'M38 58 50 70 62 58 56 56Q50 60 44 56Z', role: 'gold' },
    NECK,
    FACE,
    // youthful — a single side lock, no beard
    { tag: 'path', d: 'M34 40Q30 48 33 55 35 48 37 45Z', role: 'hair' },
    { tag: 'path', d: 'M66 40Q70 48 67 55 65 48 63 45Z', role: 'hair' },
    // soft cap hugging the crown of the head
    { tag: 'path', d: 'M33 33Q50 16 67 33Q59 27 50 27 41 27 33 33Z', role: 'gold', outline: true },
    { tag: 'path', d: 'M33 33Q50 29 67 33L66 37Q50 33 34 37Z', role: 'goldDark' },
    // a single sweeping feather
    { tag: 'path', d: 'M64 30Q82 22 80 4 72 16 60 24Z', role: 'robe', outline: true },
  ],
}

const QUEEN: CourtFigureSpec = {
  rank: 'Q',
  kind: 'queen',
  suitAnchor: { x: 24, y: 62, size: 14 },
  shapes: [
    { tag: 'path', d: 'M14 76 19 58Q50 50 81 58L86 76Z', role: 'robe' },
    // long framing hair down both sides of the face
    { tag: 'path', d: 'M33 36Q26 52 31 66 34 54 39 48Z', role: 'hair' },
    { tag: 'path', d: 'M67 36Q74 52 69 66 66 54 61 48Z', role: 'hair' },
    NECK,
    FACE,
    { tag: 'path', d: 'M40 58 50 66 60 58 55 56Q50 59 45 56Z', role: 'gold' },
    // rounded three-lobe crown with pearl finials
    { tag: 'path', d: 'M34 30Q34 22 40 24 42 14 50 14 58 14 60 24 66 22 66 30Q50 24 34 30Z', role: 'gold', outline: true },
    { tag: 'circle', cx: 40, cy: 22, r: 2.4, role: 'goldDark' },
    { tag: 'circle', cx: 50, cy: 12, r: 2.6, role: 'goldDark' },
    { tag: 'circle', cx: 60, cy: 22, r: 2.4, role: 'goldDark' },
    // stem of the bloom she holds (the suit glyph is the flower head at suitAnchor)
    { tag: 'path', d: 'M24 60Q22 66 26 72', role: 'hair', stroke: true },
  ],
}

const KING: CourtFigureSpec = {
  rank: 'K',
  kind: 'king',
  suitAnchor: { x: 24, y: 60, size: 15 },
  shapes: [
    { tag: 'path', d: 'M13 76 18 57Q50 49 82 57L87 76Z', role: 'robe' },
    { tag: 'path', d: 'M36 56 50 68 64 56 58 54Q50 58 42 54Z', role: 'gold' },
    NECK,
    FACE,
    // full beard + moustache — the mature royal read that separates the King from the Jack
    { tag: 'path', d: 'M35 43Q37 64 50 66 63 64 65 43Q58 58 50 58 42 58 35 43Z', role: 'hair', outline: true },
    { tag: 'path', d: 'M43 46Q50 50 57 46 53 51 50 51 47 51 43 46Z', role: 'hair' },
    // tall cross-topped crown
    { tag: 'path', d: 'M32 32 32 18 41 25 46 12 50 20 54 12 59 25 68 18 68 32Q50 26 32 32Z', role: 'gold', outline: true },
    { tag: 'path', d: 'M48 10h4v3h3v4h-3v3h-4v-3h-3v-4h3Z', role: 'goldDark' },
    { tag: 'circle', cx: 32, cy: 18, r: 2.2, role: 'goldDark' },
    { tag: 'circle', cx: 68, cy: 18, r: 2.2, role: 'goldDark' },
    // sceptre shaft (the suit glyph caps it at suitAnchor)
    { tag: 'path', d: 'M24 58 26 74', role: 'goldDark', stroke: true },
  ],
}

const FIGURES: Record<CourtRank, CourtFigureSpec> = { J: JACK, Q: QUEEN, K: KING }

export function courtFigure(rank: CourtRank): CourtFigureSpec {
  return FIGURES[rank]
}
