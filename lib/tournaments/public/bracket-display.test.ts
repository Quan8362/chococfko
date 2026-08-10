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
  // The cap is now an ADAPTIVE token (tighter for a 7-column round-of-16 board) rather than a single
  // hardcoded px, so all seven columns fit the shell where a fixed width would clip the outer ones.
  assert.match(src, /lg:max-w-\[var\(--bkt-col-max\)\]/, 'columns stay capped via the adaptive width token')
  // `safe center` centres a small bracket but falls back to start-alignment when the row overflows, so
  // the outermost columns are reachable by scroll instead of being clipped on both sides.
  assert.match(src, /lg:\[justify-content:safe_center\]/, 'the round row uses overflow-safe centring')
  assert.doesNotMatch(src, /flex-none w-\[232px\]/, 'the old fixed-width desktop column must be gone')
})

test('column width, cap and gap are driven by the adaptive bracketColumnSizing helper', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  // A single fixed card width overflowed the shell at 7 columns. The board now derives its floor/cap/gap
  // from the pure helper keyed on the mirrored column count, so a deep round-of-16 board fits the shell.
  assert.match(src, /bracketColumnSizing\(columns\.length\)/, 'sizing must be derived from the column count')
  assert.match(src, /--bkt-col-min/, 'the adaptive column floor token must be set')
  assert.match(src, /--bkt-gap/, 'the adaptive gap token must be set')
  assert.match(src, /lg:gap-\[var\(--bkt-gap\)\]/, 'the desktop gap must consume the adaptive token')
})

test('mobile bracket keeps a fixed-width column inside a horizontal-scroll container (touch)', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  assert.match(src, /overflow-x-auto/, 'the board scrolls inside its own container, never the page body')
  assert.match(src, /flex-none w-\[220px\]/, 'below lg the column keeps a readable fixed width and scrolls')
})

test('public bracket panel stays contained inside the reading shell (no viewport breakout)', () => {
  const src = read('components/tournaments/public/TournamentDetail.tsx')
  // The bracket panel must share the shell's horizontal bounds with the hero/tabs — it may never break
  // out to a viewport width, which is what spilled the board past the page edges and scrolled the body.
  assert.doesNotMatch(src, /100vw/, 'the bracket panel must not size itself to the viewport width')
  assert.doesNotMatch(src, /94vw/, 'the old 94vw full-bleed breakout must be gone')
  assert.doesNotMatch(src, /-translate-x-1\/2/, 'the panel must not be re-centred on the viewport')
  assert.doesNotMatch(src, /lg:left-1\/2/, 'the panel must not be pulled out of the shell column')
})

test('the desktop bracket board is a self-contained scroll region, not a page-widening element', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  // The board scrolls inside its own overflow-x-auto container; it must not use a negative margin to
  // spill past the shell padding, and it must never key its width off the viewport.
  assert.match(src, /overflow-x-auto overflow-y-hidden no-scrollbar pb-3 px-1/, 'board is its own scroll region')
  assert.doesNotMatch(src, /overflow-y-hidden[^"]*-mx-/, 'the board shell must not use a negative margin to break out')
  assert.doesNotMatch(src, /100vw/, 'the board must not size any element off the viewport width')
})

test('every desktop round column can shrink to share the shell width (min-width:0)', () => {
  const src = read('components/tournaments/public/PublicBracket.tsx')
  // A flex column that cannot shrink below its content forces horizontal overflow when the rounds must
  // share one shell width. min-w-0 (+ the adaptive lg:min-w token) lets the columns fit; names truncate.
  assert.match(src, /min-w-0 lg:flex-1/, 'columns must be allowed to shrink to fit the shell')
  assert.match(src, /lg:min-w-\[var\(--bkt-col-min\)\]/, 'the adaptive floor keeps every column readable yet contained')
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
