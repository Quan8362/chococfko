// Source-analysis guards for the public knockout bracket presentation (node --test, no browser).
// They lock the wiring that unit tests of pure logic can't reach: that the card renders REAL scores
// through the pure decision layer (never the raw sets tally), and that long names stay truncated but
// keep an accessible full-name tooltip. Browser behaviour (hover/focus tooltip, overflow measurement)
// is verified manually — these assert the code keeps the right semantics so they cannot silently rot.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test('bracket card derives its score through the pure knockoutScoreView, not the raw sets tally', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  assert.match(src, /knockoutScoreView\(match\)/, 'must build the score view from the real match data')
  // The old behaviour passed match.gamesWonA / gamesWonB straight into the score column (the "1–0" bug).
  assert.doesNotMatch(src, /score=\{[^}]*match\.gamesWon[AB][^}]*\}/, 'must not render the raw sets tally as the score')
  assert.match(src, /\{sc\.detail\}/, 'multi-game detail line must be rendered')
})

test('resolved competitor names render through the truncating tooltip label', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  assert.match(src, /import TruncatedName from '\.\/TruncatedName'/, 'bracket must use the shared TruncatedName')
  assert.match(src, /<TruncatedName\b/, 'resolved names must render via TruncatedName')
})

test('TruncatedName exposes the full name to hover, focus and assistive tech', () => {
  const src = read('components/tournaments/public/TruncatedName.tsx')
  assert.match(src, /className=\{`truncate /, 'name stays on one line with an ellipsis (protects card width)')
  assert.match(src, /title=\{name\}/, 'native title tooltip carries the full name (hover + touch fallback)')
  assert.match(src, /aria-label=\{name\}/, 'accessible name is the full, untruncated name')
  assert.match(src, /onFocus=\{show\}/, 'tooltip opens on keyboard focus, not hover only')
  assert.match(src, /role="tooltip"/, 'the floating tip is a semantic tooltip')
  assert.match(src, /createPortal\(/, 'tooltip is portalled so the bracket overflow container cannot clip it')
})
