import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENT_BTN_BASE, eventButtonClass, TAB_BASE, tabButtonClass } from './selectorStyles.ts'

const toks = (s: string) => new Set(s.trim().split(/\s+/).filter(Boolean))

// A token that, if it appeared/changed only in one selection state, would resize the button's outer
// box and shift its neighbours: padding, margin, width/height/min-height, or a border *width*.
const BOX_TOKEN = /^(p[xylrtb]?-|m[xylrtb]?-|w-|h-|min-h|min-w|max-w|border-\d|border$)/

test('event button: every base (box) token is present in both active and inactive states', () => {
  for (const active of [true, false]) {
    const set = toks(eventButtonClass(active))
    for (const base of EVENT_BTN_BASE.split(/\s+/)) {
      assert.ok(set.has(base), `missing base token "${base}" when active=${active}`)
    }
  }
})

test('event button: switching selection changes only paint tokens, never box/padding/font-weight', () => {
  const a = toks(eventButtonClass(true))
  const i = toks(eventButtonClass(false))
  const diff = [...a].filter((x) => !i.has(x)).concat([...i].filter((x) => !a.has(x)))
  // Event selector keeps the same font weight in both states, so font-* must not appear in the diff.
  const forbidden = new RegExp(`${BOX_TOKEN.source}|^font-`)
  for (const t of diff) assert.ok(!forbidden.test(t), `selection changed a layout token: "${t}"`)
  // They must still differ somewhere (the colour/background that shows selection).
  assert.notDeepEqual([...a].sort(), [...i].sort())
})

test('tab button: every base (box) token is present in both active and inactive states', () => {
  for (const active of [true, false]) {
    const set = toks(tabButtonClass(active))
    for (const base of TAB_BASE.split(/\s+/)) {
      assert.ok(set.has(base), `missing base token "${base}" when active=${active}`)
    }
  }
})

test('tab button: selection changes only colour/border-colour/weight, never padding or height', () => {
  const a = toks(tabButtonClass(true))
  const i = toks(tabButtonClass(false))
  const diff = [...a].filter((x) => !i.has(x)).concat([...i].filter((x) => !a.has(x)))
  // Tabs DO switch font weight (bold↔semibold); an always-bold ghost in the component reserves the
  // bold width so that never resizes the box. So font-weight is allowed in the diff here, but nothing
  // that changes padding/margins/dimensions or the border WIDTH may be.
  for (const t of diff) assert.ok(!BOX_TOKEN.test(t), `tab selection changed a layout token: "${t}"`)
  assert.notDeepEqual([...a].sort(), [...i].sort())
})
