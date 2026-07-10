// ── Poker card art — single source of truth for suit glyphs + JQK court figures ────────────────
//
// PURE data, no React. Both card renderers import from here so the deck looks identical on every
// surface (dark lounge table, light history replay, learning pages) AND matches the Tiến Lên Miền
// Nam deck — the two games now share ONE set of court illustrations.
//
// The J/Q/K central figures are the SAME vendored, PUBLIC-DOMAIN "Vector Playing Cards" figures the
// TLMN game uses, served from `public/games/tlmn/cards/<RANK><SUIT>.svg` (Byron Knoll, public domain,
// no attribution required — see that folder's LICENSE.txt). They were cropped to the figure box so
// each card shows ONLY our own uniform corner index. Number cards 2–10 + Ace stay as our inline suit
// pips. This module NEVER touches card values, ordering, deck generation or privacy.

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
export type CourtRank = 'J' | 'Q' | 'K'
export const COURT_RANKS: readonly CourtRank[] = ['J', 'Q', 'K']

export function isCourtRank(rank: string): rank is CourtRank {
  return rank === 'J' || rank === 'Q' || rank === 'K'
}

// Filenames use an uppercase suit code (JS, QD, KH …), matching the vendored TLMN deck.
const SUIT_ASSET_CODE: Record<Suit, string> = { s: 'S', c: 'C', d: 'D', h: 'H' }

/**
 * Project-local, public-domain court illustration for a J/Q/K of the given suit. Shared with the
 * TLMN deck so both games render the identical figures. Same-origin path — never a hot-linked or
 * external URL.
 */
export function courtAssetSrc(rank: CourtRank, suit: Suit): string {
  return `/games/tlmn/cards/${rank}${SUIT_ASSET_CODE[suit]}.svg`
}
