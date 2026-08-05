// ════════════════════════════════════════════════════════════════════════════════════
// PUBLIC PODIUM — Serie A / Serie B VERTICAL COLUMNS
// ════════════════════════════════════════════════════════════════════════════════════
// Two kinds of guard, no browser:
//   • Pure unit tests of the ordering / joint-third helpers (podiumView.ts) — the podium logic itself
//     is untouched; these only pin the top→bottom order and the "two equal thirds" rule.
//   • Source-analysis of PublicPodium.tsx (same style as ui-structure.test.ts) — locks in the
//     two-column desktop / stacked-mobile layout, the reused truncating name + tooltip, semantic list,
//     decorative-medal a11y, and the no-hardcoded-text / i18n contract.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PodiumRowView } from '../admin/types.ts'
import { isJointThird, orderPodiumRows } from './podiumView.ts'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const
const SRC = read('components/tournaments/public/PublicPodium.tsx')

const row = (rank: 1 | 2 | 3, competitorId: string, isJoint = false): PodiumRowView => ({
  rank,
  competitorId,
  isJoint,
})

// ── Ordering helper ─────────────────────────────────────────────────────────────────────────
test('orderPodiumRows: gold → silver → bronze, first always on top', () => {
  const ordered = orderPodiumRows([row(3, 'c'), row(1, 'a'), row(2, 'b')])
  assert.deepEqual(
    ordered.map((r) => r.rank),
    [1, 2, 3],
  )
  assert.equal(ordered[0].competitorId, 'a')
})

test('orderPodiumRows: two joint thirds stay after silver, in stable source order (neither higher)', () => {
  const ordered = orderPodiumRows([row(1, 'a'), row(2, 'b'), row(3, 'c', true), row(3, 'd', true)])
  assert.deepEqual(
    ordered.map((r) => r.rank),
    [1, 2, 3, 3],
  )
  // Both thirds share rank 3 and keep insertion order — no first/second third-place.
  assert.deepEqual([ordered[2].competitorId, ordered[3].competitorId], ['c', 'd'])
})

test('orderPodiumRows: a single decided third yields exactly one bronze item (no fake placeholder)', () => {
  const ordered = orderPodiumRows([row(1, 'a'), row(2, 'b'), row(3, 'c')])
  assert.equal(ordered.length, 3)
  assert.equal(ordered.filter((r) => r.rank === 3).length, 1)
})

test('orderPodiumRows: empty / pending podium does not throw and stays empty', () => {
  assert.deepEqual(orderPodiumRows([]), [])
})

test('orderPodiumRows: does not mutate its input', () => {
  const input = [row(2, 'b'), row(1, 'a')]
  const snapshot = input.map((r) => r.competitorId)
  orderPodiumRows(input)
  assert.deepEqual(
    input.map((r) => r.competitorId),
    snapshot,
  )
})

// ── Joint-third detection ───────────────────────────────────────────────────────────────────
test('isJointThird: true for two rank-3 rows', () => {
  assert.equal(isJointThird([row(1, 'a'), row(2, 'b'), row(3, 'c', true), row(3, 'd', true)]), true)
})

test('isJointThird: true when a single row is flagged isJoint', () => {
  assert.equal(isJointThird([row(1, 'a'), row(2, 'b'), row(3, 'c', true)]), true)
})

test('isJointThird: false for a single decided third', () => {
  assert.equal(isJointThird([row(1, 'a'), row(2, 'b'), row(3, 'c')]), false)
})

// ── Layout: two columns on desktop/tablet, stacked on mobile ─────────────────────────────────
test('layout: mobile-first single column that becomes two columns from tablet up', () => {
  assert.match(SRC, /grid-cols-1/, 'must default to a single stacked column (mobile)')
  assert.match(SRC, /md:grid-cols-2/, 'must switch to two columns from the tablet breakpoint up')
})

test('layout: columns are top-aligned so Serie A and Serie B share the same top axis', () => {
  assert.match(SRC, /items-start/, 'columns must be top-aligned')
})

test('layout: Serie order comes from source data (A/championship first, then B/consolation)', () => {
  // The component maps `withPodium` in array order — championship precedes consolation upstream, so
  // Serie A renders left/top and Serie B right/bottom without any hardcoded event/serie names.
  assert.match(SRC, /withPodium\.map/, 'both series render from the same map (no copy-pasted JSX)')
  assert.match(SRC, /title=\{t\(`podium\.\$\{b\.bracket\}`\)\}/, 'serie titles must come from i18n keyed by bracket')
  // No serie title in a STRING LITERAL (comments are fine); the label must be looked up via i18n.
  assert.doesNotMatch(SRC, /['"`]Serie [AB]['"`]/, 'serie titles must not be hardcoded string literals')
})

// ── Placement item: vertical rows, medal + label + truncating name ───────────────────────────
test('item: uses the shared TruncatedName so long names truncate but expose the full accessible name', () => {
  assert.match(SRC, /import TruncatedName/, 'must reuse the TruncatedName tooltip component')
  assert.match(SRC, /<TruncatedName\s+name=\{name\}/, 'the podium name must render through TruncatedName')
})

test('item: podium is a semantic list, one item per placement', () => {
  assert.match(SRC, /<ol/, 'placements should be a semantic list')
  assert.match(SRC, /<li/, 'each placement should be a list item')
})

test('a11y: medal glyph is decorative (aria-hidden) — rank is conveyed by the text label, not colour', () => {
  assert.match(SRC, /aria-hidden="true"[^>]*>\s*\{meta\.medal\}|meta\.medal[\s\S]{0,40}aria-hidden/, 'medal must be aria-hidden')
  assert.match(SRC, /labelFor/, 'each item must render a textual rank label')
})

test('a11y: rank hierarchy is not colour-only — rank 1 carries a heavier border cue', () => {
  assert.match(SRC, /border-2/, 'rank 1 should use a heavier border, not only a colour')
})

// ── No regression: still an EmptyState on a missing/undecided podium, no service-role imports ──
test('empty: renders the shared EmptyState (no crash) when no branch has a podium', () => {
  assert.match(SRC, /withPodium\.length === 0/, 'must guard the empty case')
  assert.match(SRC, /empty\.no_podium/, 'must use the podium empty-state copy')
})

test('security: public podium imports no admin/service-role code', () => {
  assert.doesNotMatch(SRC, /admin\/giai-dau/, 'must not import admin routes')
  assert.doesNotMatch(SRC, /supabase\/admin|createAdminClient/, 'must not import the service-role client')
})

// ── i18n: every label the podium uses exists in all five locales ─────────────────────────────
test('i18n: podium labels exist and are non-empty in vi/en/ja/ko/zh', () => {
  for (const loc of LOCALES) {
    const podium = (JSON.parse(read(`messages/${loc}.json`)) as {
      tournaments?: { podium?: Record<string, string> }
    }).tournaments?.podium
    assert.ok(podium, `${loc} missing tournaments.podium`)
    for (const key of ['championship', 'consolation', 'first', 'second', 'third', 'joint_third']) {
      assert.equal(typeof podium?.[key], 'string', `${loc}.tournaments.podium.${key} missing`)
      assert.notEqual((podium?.[key] ?? '').trim(), '', `${loc}.tournaments.podium.${key} empty`)
    }
  }
})
