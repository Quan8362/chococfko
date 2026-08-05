// Source-analysis guards for the MANAGEMENT knockout bracket (components/tournaments/admin/BracketView.tsx).
// The management "Nhánh đấu" tab (Serie A, Serie B, pure knockout and group_knockout branches) all render
// through this one component, so long vi/en/ja/ko/zh names must stay truncated on one line but keep the
// SAME accessible full-name tooltip the public bracket already has — reusing the shared TruncatedName
// (portal on <body>, hover + focus + Escape), never a second bespoke tooltip. Browser behaviour
// (overflow measurement, hover/focus/Escape) is verified manually; these lock the wiring so it can't rot.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const BRACKET = 'components/tournaments/admin/BracketView.tsx'

test('management bracket reuses the shared TruncatedName (no second tooltip implementation)', () => {
  const src = read(BRACKET)
  assert.match(
    src,
    /import TruncatedName from '@\/components\/tournaments\/public\/TruncatedName'/,
    'must import the SAME shared tooltip the public bracket uses',
  )
  assert.match(src, /<TruncatedName\b/, 'resolved competitor names render via TruncatedName')
  // The management bracket must not grow its own portal/tooltip — the shared component owns that.
  assert.doesNotMatch(src, /role="tooltip"/, 'no bespoke tooltip markup in the management bracket')
  assert.doesNotMatch(src, /createPortal/, 'no bespoke portal in the management bracket')
})

test('both competitor sides of a match card go through the tooltip', () => {
  const src = read(BRACKET)
  // Side is rendered for competitor A and competitor B; a single shared Side sub-component guarantees
  // both the top and bottom team of every card get the identical tooltip treatment.
  assert.match(src, /<Side\s+name=\{a\}/, 'top competitor renders through Side')
  assert.match(src, /<Side\s+name=\{b\}/, 'bottom competitor renders through Side')
})

test('only a resolved name gets the tooltip; a TBD slot stays plain (no needless tab stop)', () => {
  const src = read(BRACKET)
  assert.match(src, /present && name \?/, 'tooltip is gated on a present, real name')
  assert.match(src, /\{name \?\? t\('tbd'\)\}/, 'the empty slot falls back to the translated TBD label, not a raw key')
})

test('the tooltip name span cannot widen the card (truncate + min-w-0 flex)', () => {
  const src = read(BRACKET)
  // TruncatedName renders `truncate ${className}`; the caller must supply min-w-0 + flex so the ellipsis
  // engages and the fixed-width card never grows.
  assert.match(src, /<TruncatedName name=\{name\} className=\{`min-w-0 flex-1/, 'name column is min-w-0 flex-1 (ellipsis, stable width)')
})

test('the score column stays flex-none so the tooltip name never collides with or hides the score', () => {
  const src = read(BRACKET)
  assert.match(src, /score !== null && <span className=\{`flex-none/, 'score keeps its own flex-none column')
})

test('the board still scrolls inside its own overflow-x container (touch), page body never scrolls sideways', () => {
  const src = read(BRACKET)
  assert.match(src, /overflow-x-auto/, 'the bracket scrolls in its own container, not the page')
})
