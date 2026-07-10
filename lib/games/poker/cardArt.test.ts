// Framework-free tests for the shared card art (suit glyphs + JQK court figures).
// Run with:  node --test lib/games/poker/cardArt.test.ts
//
// These lock the contract the two React card renderers rely on: correct suit colours, T→10, the
// court-rank predicate, and — crucially — that J/Q/K resolve to the vendored public-domain figure
// files that actually exist on disk (so the deck really shows Jack/Queen/King artwork). They
// deliberately do NOT touch card values, deck order or privacy.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { RANKS, SUITS } from './deck.ts'
import {
  CARD_RED,
  CARD_INK,
  CLUB_GEOM,
  COURT_RANKS,
  DIAMOND_PATH,
  HEART_PATH,
  SPADE_PATH,
  SUIT_LABEL,
  courtAssetSrc,
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
  assert.equal(new Set(labels).size, SUITS.length)
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

test('court asset src maps rank+suit to the correct same-origin figure path', () => {
  assert.equal(courtAssetSrc('J', 'h'), '/games/tlmn/cards/JH.svg')
  assert.equal(courtAssetSrc('Q', 'd'), '/games/tlmn/cards/QD.svg')
  assert.equal(courtAssetSrc('K', 's'), '/games/tlmn/cards/KS.svg')
  assert.equal(courtAssetSrc('J', 'c'), '/games/tlmn/cards/JC.svg')
  // Always a project-local path — never an external / hot-linked URL.
  for (const r of COURT_RANKS) {
    for (const s of SUITS) {
      const src = courtAssetSrc(r, s)
      assert.ok(src.startsWith('/games/tlmn/cards/'), `${r}${s} is same-origin`)
      assert.ok(!/^https?:/i.test(src), `${r}${s} is not an external URL`)
    }
  }
})

test('J, Q and K figures resolve to distinct files, one per rank×suit', () => {
  const srcs = COURT_RANKS.flatMap((r) => SUITS.map((s) => courtAssetSrc(r, s)))
  assert.equal(srcs.length, 12)
  assert.equal(new Set(srcs).size, 12) // Jack ≠ Queen ≠ King, and each suit distinct
})

test('every vendored court figure file exists and is a real SVG', () => {
  for (const r of COURT_RANKS) {
    for (const s of SUITS) {
      // courtAssetSrc is a web path (leading slash) → the file lives under public/.
      const file = 'public' + courtAssetSrc(r, s)
      assert.ok(existsSync(file), `${file} exists`)
      const svg = readFileSync(file, 'utf8')
      assert.ok(svg.includes('<svg') && svg.includes('</svg>'), `${file} is an SVG`)
      assert.ok(svg.length > 200, `${file} has real figure content`)
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
