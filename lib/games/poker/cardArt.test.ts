// Framework-free tests for the shared card art (suit glyphs + JQK court figures).
// Run with:  node --test lib/games/poker/cardArt.test.ts
//
// These lock the STRUCTURE of the art the two React card renderers consume: that Jack, Queen and
// King each resolve to distinct court figures, that suit colours are correct, and that the geometry
// is well-formed. They deliberately do NOT touch card values, deck order or privacy.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RANKS, SUITS } from './deck.ts'
import type { CourtRank } from './cardArt.ts'
import {
  CARD_RED,
  CARD_INK,
  CLUB_GEOM,
  COURT_RANKS,
  DIAMOND_PATH,
  HEART_PATH,
  SPADE_PATH,
  SUIT_LABEL,
  courtFigure,
  isCourtRank,
  rankLabel,
  suitColor,
} from './cardArt.ts'

test('suit colours: hearts & diamonds are red, spades & clubs are ink', () => {
  assert.equal(suitColor('h'), CARD_RED)
  assert.equal(suitColor('d'), CARD_RED)
  assert.equal(suitColor('s'), CARD_INK)
  assert.equal(suitColor('c'), CARD_INK)
  assert.notEqual(CARD_RED, CARD_INK)
})

test('every suit has a distinct human label', () => {
  const labels = SUITS.map((s) => SUIT_LABEL[s])
  assert.deepEqual(new Set(labels).size, SUITS.length)
})

test('rankLabel renders T as "10" and leaves other ranks intact', () => {
  assert.equal(rankLabel('T'), '10')
  assert.equal(rankLabel('J'), 'J')
  assert.equal(rankLabel('Q'), 'Q')
  assert.equal(rankLabel('K'), 'K')
  assert.equal(rankLabel('A'), 'A')
  assert.equal(rankLabel('2'), '2')
})

test('exactly J, Q, K are court ranks across the whole deck', () => {
  assert.deepEqual([...COURT_RANKS], ['J', 'Q', 'K'])
  const court = RANKS.filter((r) => isCourtRank(r))
  assert.deepEqual(court, ['J', 'Q', 'K'])
  for (const r of ['A', 'T', '2', '9'] as const) assert.equal(isCourtRank(r), false)
})

test('J → jack, Q → queen, K → king figures', () => {
  assert.equal(courtFigure('J').kind, 'jack')
  assert.equal(courtFigure('Q').kind, 'queen')
  assert.equal(courtFigure('K').kind, 'king')
})

test('Jack, Queen and King are structurally distinct', () => {
  const kinds = COURT_RANKS.map((r) => courtFigure(r).kind)
  assert.equal(new Set(kinds).size, 3)
  // Distinct silhouettes: pearl/finial circle counts differ (Q crown pearls=3, K crown balls=2,
  // J cap has none) — a stable, renderer-independent fingerprint that the three figures differ.
  const circles = (r: CourtRank) => courtFigure(r).shapes.filter((s) => s.tag === 'circle').length
  assert.equal(circles('Q'), 3)
  assert.equal(circles('K'), 2)
  assert.equal(circles('J'), 0)
})

test('King has a beard, Queen & King wear a crown, Jack wears a gold cap', () => {
  // Every court figure carries gold headwear (cap or crown).
  for (const r of COURT_RANKS) {
    assert.ok(courtFigure(r).shapes.some((s) => s.role === 'gold'), `${r} has gold headwear`)
  }
  // The King is the only figure with an outlined hair mass (the full beard) — the mature read.
  const beardish = (r: CourtRank) => courtFigure(r).shapes.filter((s) => s.role === 'hair' && s.outline).length
  assert.equal(beardish('K'), 1)
  assert.equal(beardish('J'), 0)
})

test('every court figure has a face, a robe and a suit anchor', () => {
  for (const r of COURT_RANKS) {
    const f = courtFigure(r)
    assert.ok(f.shapes.some((s) => s.role === 'skin'), `${r} has a face`)
    assert.ok(f.shapes.some((s) => s.role === 'robe'), `${r} has a robe`)
    assert.ok(f.suitAnchor.size > 0, `${r} suit anchor sized`)
    assert.ok(f.suitAnchor.x > 0 && f.suitAnchor.y > 0, `${r} suit anchor placed`)
  }
})

test('court geometry is well-formed (paths start with M, circles have radius)', () => {
  for (const r of COURT_RANKS) {
    for (const s of courtFigure(r).shapes) {
      if (s.tag === 'path') {
        assert.ok(typeof s.d === 'string' && s.d.startsWith('M'), `${r} path starts with M`)
      } else {
        assert.ok((s.r ?? 0) > 0, `${r} circle has radius`)
      }
    }
  }
})

test('suit glyph geometry exists for all four suits', () => {
  for (const p of [SPADE_PATH, DIAMOND_PATH, HEART_PATH]) {
    assert.ok(p.startsWith('M'))
  }
  assert.equal(CLUB_GEOM.circles.length, 3)
  assert.ok(CLUB_GEOM.stem.startsWith('M'))
})
