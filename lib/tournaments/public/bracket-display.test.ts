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

test('desktop board expands each round to share the width (no fixed-width scroll trap)', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  // At lg+ every round column becomes flex-1 and is capped, so all rounds share the row and fit on one
  // screen — the old behaviour was a fixed w-[232px] per column that forced a horizontal scrollbar.
  assert.match(src, /lg:flex-1/, 'columns must grow to share the desktop width')
  assert.match(src, /lg:max-w-\[\d+px\]/, 'columns stay capped so a small bracket stays balanced')
  assert.match(src, /lg:justify-center/, 'the round row is centred at desktop widths')
  assert.doesNotMatch(src, /flex-none w-\[232px\]/, 'the old fixed-width desktop column must be gone')
})

test('mobile bracket keeps a fixed-width column inside a horizontal-scroll container (touch)', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  assert.match(src, /overflow-x-auto/, 'the board scrolls inside its own container, never the page body')
  assert.match(src, /flex-none w-\[220px\]/, 'below lg the column keeps a readable fixed width and scrolls')
})

test('public bracket panel breaks out of the reading shell to a capped full-bleed width', () => {
  const src = read('components/tournaments/public/TournamentDetail.tsx')
  // The bracket panel escapes the ≤1320px reading column at lg+ (centred, capped at 94vw/1560px) so the
  // board uses most of the viewport without ever making the page body scroll sideways.
  assert.match(src, /lg:w-\[min\(94vw,1560px\)\]/, 'full-bleed width is capped so ultra-wide stays balanced')
  assert.match(src, /lg:-translate-x-1\/2/, 'the widened panel stays centred in the viewport')
})

test('TruncatedName exposes the full name to hover, focus and assistive tech', () => {
  const src = read('components/tournaments/public/TruncatedName.tsx')
  assert.match(src, /className=\{`truncate /, 'name stays on one line with an ellipsis (protects card width)')
  assert.match(src, /title=\{name\}/, 'native title tooltip carries the full name (hover + touch fallback)')
  assert.match(src, /aria-label=\{name\}/, 'accessible name is the full, untruncated name')
  assert.match(src, /onFocus=\{show\}/, 'tooltip opens on keyboard focus, not hover only')
  assert.match(src, /role="tooltip"/, 'the floating tip is a semantic tooltip')
  assert.match(src, /createPortal\(/, 'tooltip is portalled so the bracket overflow container cannot clip it')
  assert.match(src, /aria-describedby=\{open \? tipId : undefined\}/, 'an open tooltip is linked back to its trigger')
  assert.match(src, /tabIndex=\{clipped \? 0 : undefined\}/, 'only a clipped name becomes focusable (no extra tab stops)')
})

test('TruncatedName dismisses the floating tip on Escape', () => {
  const src = read('components/tournaments/public/TruncatedName.tsx')
  assert.match(src, /e\.key === 'Escape'/, 'Escape closes the tooltip')
  assert.match(src, /addEventListener\('keydown', onKey\)/, 'the Escape handler is bound while the tip is open')
})
