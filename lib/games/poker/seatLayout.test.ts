// Seat-geometry tests for the pure Poker layout module.
// Run with:  node --test lib/games/poker/seatLayout.test.ts
//
// Covers the visual-spec layout contract: explicit seat maps for 2/3/4/5/6 players across all
// three landscape layouts, the hero always at the bottom-center, balanced (non-broken) rings,
// in-bounds anchors, and the "rotate so the viewer sits at the bottom" mapping (incl. spectator).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  seatAnchors,
  pocketAnchors,
  tableGeometry,
  visualPosition,
  anchorForSeat,
  POKER_MIN_CAPACITY,
  POKER_MAX_CAPACITY,
  type PokerTableLayout,
} from './seatLayout.ts'

const LAYOUTS: PokerTableLayout[] = ['desktop', 'tablet', 'mobile']
const CAPS = [2, 3, 4, 5, 6]

test('every capacity × layout yields exactly `capacity` anchors', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const anchors = seatAnchors(cap, layout)
      assert.equal(anchors.length, cap, `${cap}p ${layout}`)
    }
  }
})

test('position 0 is always the hero anchor on the bottom row', () => {
  // The art is a paired-pad table (no seat lands in the centre gap for even counts), so the hero is
  // not necessarily x≈50 — but it is always flagged and always on the lowest (largest-y) row.
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const anchors = seatAnchors(cap, layout)
      assert.equal(anchors[0].isHero, true, `${cap}p ${layout} hero flag`)
      const maxY = Math.max(...anchors.map((a) => a.yPct))
      assert.equal(anchors[0].yPct, maxY, `${cap}p ${layout} hero is lowest`)
    }
  }
})

test('every seat has a card pocket inboard of (above) its pad', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const pads = seatAnchors(cap, layout)
      const pockets = pocketAnchors(cap, layout)
      assert.equal(pads.length, pockets.length, `${cap}p ${layout} pocket count`)
      for (let i = 0; i < pads.length; i++) {
        // A pocket sits between its pad and the board centre — never further from centre than the
        // pad, and (for non-hero seats on the arc) at least as high on screen as the pad.
        const towardCentreX = Math.abs(pockets[i].xPct - 50) <= Math.abs(pads[i].xPct - 50) + 0.5
        assert.ok(towardCentreX, `${cap}p ${layout} pocket ${i} not inboard (${pockets[i].xPct})`)
      }
    }
  }
})

test('exactly one hero anchor per ring', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const heroes = seatAnchors(cap, layout).filter((a) => a.isHero)
      assert.equal(heroes.length, 1, `${cap}p ${layout}`)
    }
  }
})

test('all anchors stay inside the play area with a sane margin', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      for (const a of seatAnchors(cap, layout)) {
        assert.ok(a.xPct >= 4 && a.xPct <= 96, `${cap}p ${layout} x in-bounds (${a.xPct})`)
        assert.ok(a.yPct >= 4 && a.yPct <= 96, `${cap}p ${layout} y in-bounds (${a.yPct})`)
      }
    }
  }
})

test('rings are horizontally symmetric about the vertical axis', () => {
  // For each non-hero anchor there is a mirror anchor at (100 - x) with the same y (within ε).
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const anchors = seatAnchors(cap, layout)
      for (const a of anchors) {
        const mirrored = anchors.some(
          (b) => Math.abs(b.xPct - (100 - a.xPct)) < 0.6 && Math.abs(b.yPct - a.yPct) < 0.6,
        )
        assert.ok(mirrored, `${cap}p ${layout} no mirror for (${a.xPct},${a.yPct})`)
      }
    }
  }
})

test('no two seats overlap (anchors are distinct)', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const anchors = seatAnchors(cap, layout)
      for (let i = 0; i < anchors.length; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          const dx = anchors[i].xPct - anchors[j].xPct
          const dy = anchors[i].yPct - anchors[j].yPct
          assert.ok(Math.hypot(dx, dy) > 8, `${cap}p ${layout} seats ${i}/${j} too close`)
        }
      }
    }
  }
})

test('visualPosition rotates the viewer to the bottom (position 0)', () => {
  for (const cap of CAPS) {
    for (let viewer = 0; viewer < cap; viewer++) {
      assert.equal(visualPosition(viewer, viewer, cap), 0, `${cap}p viewer ${viewer}`)
    }
  }
})

test('visualPosition preserves clockwise ring order relative to the viewer', () => {
  const cap = 6
  const viewer = 4
  // The seat immediately clockwise of the viewer takes position 1, and so on.
  for (let offset = 0; offset < cap; offset++) {
    const physical = (viewer + offset) % cap
    assert.equal(visualPosition(physical, viewer, cap), offset)
  }
})

test('visualPosition is a bijection (no two seats collide on one position)', () => {
  for (const cap of CAPS) {
    for (let viewer = 0; viewer < cap; viewer++) {
      const seen = new Set<number>()
      for (let s = 0; s < cap; s++) seen.add(visualPosition(s, viewer, cap))
      assert.equal(seen.size, cap, `${cap}p viewer ${viewer} not a bijection`)
    }
  }
})

test('spectator (null viewer) uses the identity mapping — physical 0 at the bottom', () => {
  for (const cap of CAPS) {
    for (let s = 0; s < cap; s++) {
      assert.equal(visualPosition(s, null, cap), s, `${cap}p seat ${s}`)
    }
  }
})

test('visualPosition normalises out-of-range / negative indexes', () => {
  assert.equal(visualPosition(6, 0, 6), 0) // wraps
  assert.equal(visualPosition(-1, 0, 6), 5) // negative wraps to last
  assert.equal(visualPosition(7, 1, 6), 0) // 7 % 6 = 1 = viewer ⇒ pos 0
})

test('anchorForSeat returns the hero anchor for the viewer themselves', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const a = anchorForSeat(2 % cap, 2 % cap, cap, layout)
      assert.equal(a.isHero, true, `${cap}p ${layout}`)
    }
  }
})

test('tableGeometry exposes a centre above the hero and per-layout scales', () => {
  for (const layout of LAYOUTS) {
    for (const cap of CAPS) {
      const g = tableGeometry(cap, layout)
      assert.equal(g.capacity, cap)
      assert.equal(g.layout, layout)
      assert.equal(g.seats.length, cap)
      // Board centre sits above the hero band.
      assert.ok(g.center.yPct < g.seats[0].yPct, `${cap}p ${layout} centre above hero`)
      assert.ok(g.boardCardW > 0 && g.seatAvatarSize > 0)
    }
  }
})

test('capacity is clamped to the supported 2..6 range', () => {
  assert.equal(seatAnchors(1, 'desktop').length, POKER_MIN_CAPACITY)
  assert.equal(seatAnchors(99, 'desktop').length, POKER_MAX_CAPACITY)
  assert.equal(tableGeometry(0, 'mobile').capacity, POKER_MIN_CAPACITY)
})

test('mobile ellipse is wider and shorter than desktop (uses the landscape asset density)', () => {
  const d = seatAnchors(6, 'desktop')
  const m = seatAnchors(6, 'mobile')
  const spread = (anchors: { xPct: number; yPct: number }[]) => {
    const xs = anchors.map((a) => a.xPct)
    const ys = anchors.map((a) => a.yPct)
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  const ds = spread(d)
  const ms = spread(m)
  assert.ok(ms.w >= ds.w, 'mobile wider')
  assert.ok(ms.h <= ds.h, 'mobile shorter')
})
