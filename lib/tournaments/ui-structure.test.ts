// ════════════════════════════════════════════════════════════════════════════════════
// TOURNAMENT UI — STRUCTURAL / I18N / A11Y GUARDS (Prompt 12)
// ════════════════════════════════════════════════════════════════════════════════════
// Source-analysis tests (node --test, no browser) that lock in the i18n, accessibility and
// responsive properties audited in Prompt 12 so they cannot silently regress. Each test reads the
// actual component / message source from disk (cwd = web/) and asserts a concrete structural fact.
// These are guards, not pixel checks — they verify the code contains the right semantics, not how it
// renders. Browser-rendered behaviour (focus movement, overflow measurement) is covered by manual
// smoke verification documented in docs/tournaments/TOURNAMENT_SYSTEM_DESIGN.md §Prompt 12.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
// Normalize CRLF→LF so line-based analysis (split('\n') + the `//comment` strip regex, which relies on
// `$`/`.` not seeing a trailing \r) is identical on a Windows checkout (git autocrlf=true → CRLF) and
// a POSIX/LF checkout. Reads source only; never mutates.
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>

// Every tournament-related top-level namespace. Parity across these is what the module depends on.
const TOURNAMENT_NAMESPACES = [
  'tournaments',
  'admin_tournaments',
  'admin_tournament_events',
  'admin_tournament_competitors',
  'admin_tournament_groups',
  'admin_group_assignment',
  'admin_group_matches',
  'admin_round_robin_preview',
  'admin_match_scores',
  'admin_group_standings',
  'admin_qualification',
  'admin_tie_resolution',
  'admin_knockout_seeding',
  'admin_knockout_bracket',
  'admin_knockout_results',
  'admin_podium',
  'admin_group_knockout',
  'admin_connection_status',
  'admin_impact_preview',
  'admin_downstream_reset',
]

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  )
}
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj)
}
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)(?:,[^}]*)?\}/g)].map((m) => m[1]).sort()
}

// ── #1 — i18n key completeness across 5 locales for every tournament namespace ──────────────
test('#1 i18n: every tournament namespace has identical key sets across 5 locales', () => {
  for (const ns of TOURNAMENT_NAMESPACES) {
    const viNs = messages.vi[ns]
    assert.ok(viNs, `vi is missing namespace "${ns}"`)
    const ref = new Set(flatKeys(viNs))
    for (const loc of LOCALES) {
      if (loc === 'vi') continue
      const locNs = messages[loc][ns]
      assert.ok(locNs, `${loc} is missing namespace "${ns}"`)
      const got = new Set(flatKeys(locNs))
      const missing = [...ref].filter((k) => !got.has(k))
      const extra = [...got].filter((k) => !ref.has(k))
      assert.equal(missing.length, 0, `${loc}.${ns} missing keys: ${missing.join(', ')}`)
      assert.equal(extra.length, 0, `${loc}.${ns} has extra keys (typo?): ${extra.join(', ')}`)
    }
  }
})

test('#1b i18n: no empty tournament strings, and interpolation placeholders match vi reference', () => {
  for (const ns of TOURNAMENT_NAMESPACES) {
    for (const key of flatKeys(messages.vi[ns])) {
      const refVal = getPath(messages.vi[ns], key)
      if (typeof refVal !== 'string') continue
      const refPh = placeholders(refVal)
      for (const loc of LOCALES) {
        const val = getPath(messages[loc][ns], key)
        assert.equal(typeof val, 'string', `${loc}.${ns}.${key} is not a string`)
        assert.notEqual((val as string).trim(), '', `${loc}.${ns}.${key} is empty`)
        assert.deepEqual(
          placeholders(val as string),
          refPh,
          `${loc}.${ns}.${key} placeholder mismatch (vi: {${refPh.join(',')}})`,
        )
      }
    }
  }
})

// ── #2 — no hardcoded user-facing text in tournament UI ─────────────────────────────────────
const TOURNAMENT_TSX = [
  'components/tournaments/ConnectionIndicator.tsx',
  'components/tournaments/admin/WorkspaceTabs.tsx',
  'components/tournaments/admin/EventWorkspace.tsx',
  'components/tournaments/admin/KnockoutWorkspace.tsx',
  'components/tournaments/admin/ImpactPreviewDialog.tsx',
  'components/tournaments/admin/ConfirmDialog.tsx',
  'components/tournaments/admin/StandingsTable.tsx',
  'components/tournaments/admin/StandingsLegend.tsx',
  'components/tournaments/admin/GroupAssignmentBoard.tsx',
  'components/tournaments/admin/BracketView.tsx',
  'components/tournaments/public/TournamentDetail.tsx',
  'components/tournaments/public/EmptyState.tsx',
]

test('#2 no hardcoded Vietnamese user-facing text in tournament tsx (comments allowed)', () => {
  const viChars = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i
  for (const f of TOURNAMENT_TSX) {
    const lines = read(f).split('\n')
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '')
      // A Vietnamese-accented run inside a JSX/quote context that is NOT a t(...) call.
      if (viChars.test(code) && !/\bt[A-Za-z]*\(/.test(code)) {
        assert.fail(`Possible hardcoded VI text in ${f}:${i + 1} → ${line.trim()}`)
      }
    })
  }
})

// ── #3 — tabs keyboard navigation (admin workspaces + public detail) ─────────────────────────
test('#3 tablists implement the WAI-ARIA keyboard pattern', () => {
  // The reusable tablist primitive + the self-contained public detail tablist.
  for (const f of [
    'components/tournaments/admin/WorkspaceTabs.tsx',
    'components/tournaments/public/TournamentDetail.tsx',
  ]) {
    const src = read(f)
    assert.match(src, /role="tablist"/, `${f} missing role=tablist`)
    assert.match(src, /role="tab"/, `${f} missing role=tab`)
    assert.match(src, /aria-selected=/, `${f} missing aria-selected`)
    assert.match(src, /onKeyDown=/, `${f} missing onKeyDown`)
    assert.match(src, /ArrowRight|ArrowLeft/, `${f} missing arrow-key handling`)
    // Prompt 14 (F2 regression): the full WAI-ARIA tabs set includes Home/End on BOTH tablists.
    assert.match(src, /'Home'/, `${f} missing Home-key handling`)
    assert.match(src, /'End'/, `${f} missing End-key handling`)
    // A visible focus ring on the roving tab (keyboard users must see where focus is).
    assert.match(src, /focus-visible:/, `${f} missing focus-visible styling on tabs`)
  }
  // public detail owns its own tabpanel wrapper
  assert.match(read('components/tournaments/public/TournamentDetail.tsx'), /role="tabpanel"/, 'public detail missing tabpanel')
  // both admin workspaces route through the shared primitive AND wrap content in a tabpanel
  for (const f of [
    'components/tournaments/admin/EventWorkspace.tsx',
    'components/tournaments/admin/KnockoutWorkspace.tsx',
  ]) {
    assert.match(read(f), /<WorkspaceTabs/, `${f} should use the accessible WorkspaceTabs primitive`)
    assert.match(read(f), /role="tabpanel"/, `${f} missing tabpanel wrapper`)
  }
})

// ── #4 — dialogs: modal semantics, Escape close, focus management ────────────────────────────
test('#4 dialogs are modal, Escape-closable and manage focus', () => {
  for (const f of [
    'components/tournaments/admin/ImpactPreviewDialog.tsx',
    'components/tournaments/admin/ConfirmDialog.tsx',
  ]) {
    const src = read(f)
    assert.match(src, /role="dialog"/, `${f} missing role=dialog`)
    assert.match(src, /aria-modal="true"/, `${f} missing aria-modal`)
    assert.match(src, /aria-labelledby=/, `${f} missing aria-labelledby`)
    assert.match(src, /'Escape'/, `${f} missing Escape handling`)
    assert.match(src, /\.focus\(\)/, `${f} missing focus management`)
  }
  // Prompt 14 (F3 regression): ConfirmDialog's focus effect must be keyed on `open` alone and read
  // the latest onCancel/pending through refs, so a fresh onCancel identity on a parent re-render can't
  // re-run the effect and steal focus back to the opener (the observed dev/StrictMode artifact).
  const cd = read('components/tournaments/admin/ConfirmDialog.tsx')
  assert.match(cd, /onCancelRef/, 'ConfirmDialog should read onCancel through a ref, not a raw effect dep')
  assert.match(cd, /\}, \[open\]\)/, 'ConfirmDialog focus effect should depend on [open] only')
  assert.doesNotMatch(cd, /\}, \[open, pending, onCancel\]\)/, 'ConfirmDialog must not key its focus effect on onCancel/pending')
})

// ── #5 — drag/drop has a keyboard/button fallback ───────────────────────────────────────────
// The board offers a labelled drag handle for pointer users and, as the keyboard/no-DnD fallback,
// a native <select> ("move to any container") on every chip — keyboard-operable and screen-reader
// labelled. Asserting those controls keeps the fallback guarantee without pinning the exact UI shape.
test('#5 group assignment + seeding expose button/select move controls (dnd fallback)', () => {
  const board = read('components/tournaments/admin/GroupAssignmentBoard.tsx')
  for (const label of ['drag_handle', 'move_to', 'move_to_named']) {
    assert.match(board, new RegExp(`moveLabels\\('${label}'`), `GroupAssignmentBoard missing ${label} control`)
  }
})

// ── #6 — realtime connection status is accessible (not color-only) ──────────────────────────
test('#6 ConnectionIndicator is a labelled live region with text, not color-only', () => {
  const src = read('components/tournaments/ConnectionIndicator.tsx')
  assert.match(src, /role="status"/, 'missing role=status')
  assert.match(src, /aria-live=/, 'missing aria-live')
  assert.match(src, /realtime\.\$\{status\}|realtime\.`|t\(`realtime/, 'status label must be textual')
  assert.match(src, /\{label\}/, 'the visible text label must be rendered')
})

// ── #7 — qualification / warnings carry shape+text, never color alone ───────────────────────
test('#7 standings qualification markers use an icon + text label, not color only', () => {
  const src = read('components/tournaments/admin/StandingsTable.tsx')
  // each qualification state pairs a decorative glyph with a translated short label
  assert.match(src, /slot_championship_short/, 'missing championship text label')
  assert.match(src, /slot_consolation_short/, 'missing consolation text label')
  assert.match(src, /slot_undetermined_short/, 'missing undetermined text label')
  assert.match(src, /aria-hidden>[◆▲?]/, 'qualification glyph should be present and aria-hidden')
})

// ── #8 / #9 — bracket + tables scroll inside their own container ─────────────────────────────
test('#8 bracket scrolls inside its own overflow-x container (no full-page overflow)', () => {
  assert.match(read('components/tournaments/admin/BracketView.tsx'), /overflow-x-auto/, 'BracketView needs overflow-x-auto')
})

test('#9 data tables scroll inside an overflow-x container', () => {
  for (const f of [
    'components/tournaments/admin/StandingsTable.tsx',
    'components/tournaments/public/PublicStandings.tsx',
  ]) {
    assert.match(read(f), /overflow-x-auto/, `${f} table needs overflow-x-auto`)
  }
})

// ── #10 — forms guard against double-submit while pending ────────────────────────────────────
test('#10 mutating forms disable their submit while a transition is pending', () => {
  for (const f of [
    'components/tournaments/admin/EventForm.tsx',
    'components/tournaments/admin/TournamentForm.tsx',
    'components/tournaments/admin/ScoreEditor.tsx',
    'components/tournaments/admin/ImpactPreviewDialog.tsx',
  ]) {
    const src = read(f)
    assert.match(src, /useTransition|isPending|pending/, `${f} should track a pending state`)
    assert.match(src, /disabled=/, `${f} should disable controls while pending`)
  }
})

// ── #11 — every workspace tab has an empty-state string (missing data ≠ error) ───────────────
test('#11 each format/tab has i18n empty-state copy', () => {
  const t = messages.vi.tournaments as Record<string, Record<string, string>>
  assert.ok(t.empty, 'tournaments.empty group missing')
  // every "not started yet" state has both a title and a hint (missing data ≠ error)
  for (const key of ['no_events', 'no_competitors', 'no_schedule', 'no_standings', 'no_knockout', 'no_podium']) {
    assert.ok(typeof t.empty[key] === 'string' && t.empty[key].trim() !== '', `missing empty-state title "${key}"`)
    assert.ok(
      typeof t.empty[`${key}_hint`] === 'string' && t.empty[`${key}_hint`].trim() !== '',
      `missing empty-state hint "${key}_hint"`,
    )
  }
})

// ── #12 — impact/reset dialog requires typing the exact RESET word ───────────────────────────
test('#12 impact dialog gates the destructive reset behind an exact RESET confirmation', () => {
  const src = read('components/tournaments/admin/ImpactPreviewDialog.tsx')
  assert.match(src, /const CONFIRM_WORD = 'RESET'/, 'CONFIRM_WORD must be RESET')
  assert.match(src, /confirmText === CONFIRM_WORD/, 'reset must require exact confirm word match')
  assert.doesNotMatch(src, /window\.confirm|window\.alert/, 'must not use a bare browser confirm/alert')
})

// ── #13 — public surface imports no admin controls / service-role code ───────────────────────
test('#13 public tournament components do not import admin actions or service-role clients', () => {
  const publicFiles = [
    'components/tournaments/public/TournamentDetail.tsx',
    'components/tournaments/public/PublicOverview.tsx',
    'components/tournaments/public/PublicSchedule.tsx',
    'components/tournaments/public/PublicStandings.tsx',
    'components/tournaments/public/PublicPodium.tsx',
    'components/tournaments/public/PublicCompetitors.tsx',
    'app/giai-dau/page.tsx',
    'app/giai-dau/[slug]/page.tsx',
  ]
  for (const f of publicFiles) {
    const src = read(f)
    assert.doesNotMatch(src, /admin\/giai-dau/, `${f} must not import admin routes`)
    assert.doesNotMatch(src, /supabase\/admin|createAdminClient/, `${f} must not import the service-role client`)
  }
})

// ── #14 — navigation exposes the tournament entry (desktop + mobile + games hub) ─────────────
test('#14 desktop nav, mobile menu and games hub all link to /giai-dau', () => {
  for (const f of ['components/Nav.tsx', 'components/MobileMenu.tsx', 'app/games/page.tsx']) {
    assert.match(read(f), /\/giai-dau/, `${f} should link to /giai-dau`)
  }
})

// ── #15 — realtime refresh preserves tab/event selection (soft refetch, not full reload) ─────
test('#15 realtime refresh uses a soft refetch and never a full-page reload', () => {
  for (const f of [
    'components/tournaments/public/TournamentDetail.tsx',
    'components/tournaments/admin/AdminRealtimeBanner.tsx',
  ]) {
    const src = read(f)
    assert.doesNotMatch(src, /window\.location\.reload|location\.href\s*=/, `${f} must not hard-reload on realtime updates`)
  }
})

// ── #16 — management standings shows ONE abbreviation legend for all groups ───────────────────
// The management standings tab explains its abbreviated columns (TR/T/B/Đ/ĐG/ĐM/HS) with a single
// legend rendered above every group, never repeated per Group A/B/C/D. The public standings surface,
// which already shows readable column names, must not gain the legend.
test('#16 management StandingsTable renders exactly one StandingsLegend, outside the per-group map', () => {
  const src = read('components/tournaments/admin/StandingsTable.tsx')
  assert.match(src, /import\s+StandingsLegend\s+from\s+'\.\/StandingsLegend'/, 'must import StandingsLegend')
  const uses = [...src.matchAll(/<StandingsLegend\s*\/>/g)]
  assert.equal(uses.length, 1, 'StandingsLegend must be rendered exactly once (single legend for all groups)')
  // the single render sits before the `standings.map(` that emits Group A/B/C/D, so it is not repeated
  const legendAt = src.indexOf('<StandingsLegend')
  const mapAt = src.indexOf('standings.map(')
  assert.ok(legendAt !== -1 && mapAt !== -1 && legendAt < mapAt, 'legend must render before the per-group map')
})

test('#16b public standings never renders the management legend', () => {
  const src = read('components/tournaments/public/PublicStandings.tsx')
  assert.doesNotMatch(src, /StandingsLegend/, 'public standings must not import/render the management legend')
  assert.doesNotMatch(src, /legend_title/, 'public standings must not reference the legend i18n key')
})

// ── #17 — the legend covers all seven abbreviated columns and is accessible ───────────────────
test('#17 StandingsLegend maps all 7 abbreviations from i18n via a labelled <dl>/<abbr>', () => {
  const src = read('components/tournaments/admin/StandingsLegend.tsx')
  const shortKeys = [
    'col_played_short',
    'col_wins_short',
    'col_losses_short',
    'col_points_short',
    'col_points_for_short',
    'col_points_against_short',
    'col_diff_short',
  ]
  const fullKeys = ['col_played', 'col_wins', 'col_losses', 'col_points', 'col_points_for', 'col_points_against', 'col_diff']
  for (const k of [...shortKeys, ...fullKeys]) {
    assert.match(src, new RegExp(`'${k}'`), `StandingsLegend must reference the '${k}' i18n key`)
  }
  // semantic structure: a labelled description list with abbreviations that carry an accessible name
  assert.match(src, /<dl/, 'legend should use a <dl> description list')
  assert.match(src, /<abbr/, 'legend should use <abbr> for the abbreviations')
  assert.match(src, /aria-label=\{t\(full\)\}/, 'each abbr must expose its full label as an accessible name')
  assert.match(src, /aria-labelledby="standings-legend-title"/, 'legend group must be labelled by its title')
  assert.match(src, /t\('legend_title'\)/, 'legend must render a translated title')
})

// ── #18 — abbreviated column headers carry an accessible name + hover/focus tooltip ───────────
test('#18 StandingsTable column headers expose full names via aria-label, title and a focusable tooltip', () => {
  const src = read('components/tournaments/admin/StandingsTable.tsx')
  // the shared AbbrHead renders an <abbr> with both an accessible name and a native title fallback
  assert.match(src, /function AbbrHead/, 'headers should route through an AbbrHead helper')
  assert.match(src, /<abbr[\s\S]*?title=\{full\}/, 'AbbrHead must set a native title fallback')
  assert.match(src, /<abbr[\s\S]*?aria-label=\{full\}/, 'AbbrHead must expose the full name as accessible name')
  // the tooltip opens on both hover AND keyboard focus, and is keyboard focusable with a visible ring
  assert.match(src, /tabIndex=\{0\}/, 'abbr must be keyboard focusable')
  assert.match(src, /focus-visible:ring/, 'focused header must show a visible focus ring')
  assert.match(src, /group-focus-within:opacity-100/, 'tooltip must appear on keyboard focus, not hover only')
  assert.match(src, /role="tooltip"/, 'the supplementary tooltip must have role=tooltip')
  // every abbreviated stat column now flows through AbbrHead (no bare title= on the stat headers)
  for (const k of ['col_played', 'col_wins', 'col_losses', 'col_points', 'col_points_for', 'col_points_against', 'col_diff']) {
    assert.match(src, new RegExp(`<AbbrHead label=\\{t\\('${k}_short'\\)\\} full=\\{t\\('${k}'\\)\\} />`), `header ${k} must use AbbrHead`)
  }
})

// ── #19 — i18n: the legend title exists and is non-empty in all 5 locales ─────────────────────
test('#19 legend_title is present and non-empty across all 5 locales', () => {
  for (const loc of LOCALES) {
    const ns = messages[loc].admin_group_standings as Record<string, unknown>
    const v = ns.legend_title
    assert.equal(typeof v, 'string', `${loc}.admin_group_standings.legend_title must be a string`)
    assert.notEqual((v as string).trim(), '', `${loc}.admin_group_standings.legend_title must not be empty`)
  }
})

// ── #20 — public Athletes roster is a premium, accessible, i18n-clean surface ─────────────────
// The "Vận động viên" tab must: bucket via the pure helper (no ad-hoc reorder), lay out 2 cards on
// desktop / 1 on mobile, render a semantic <ul>/<li> roster, reuse TruncatedName for long names, and
// route every visible label through i18n (no hardcoded Vietnamese, no raw keys).
test('#20 public Athletes tab renders a premium semantic roster with pure grouping', () => {
  const src = read('components/tournaments/public/PublicCompetitors.tsx')
  // grouping goes through the pure, tested helper (never a local resort of competitors)
  assert.match(src, /from '@\/lib\/tournaments\/public\/competitorGroups'/, 'must use the pure groupCompetitors helper')
  assert.match(src, /groupCompetitors\(competitors, groups\)/, 'must call groupCompetitors with the props as-is')
  assert.doesNotMatch(src, /\.sort\(/, 'must not re-sort competitors/groups in the view')
  // responsive grid: 1 column on mobile, 2 on desktop
  assert.match(src, /grid-cols-1/, 'roster grid must be single-column on mobile')
  assert.match(src, /lg:grid-cols-2/, 'roster grid must be two-column on desktop')
  // semantic list + long-name tooltip reuse
  assert.match(src, /<ul/, 'group roster must be a semantic list')
  assert.match(src, /<li/, 'athletes must be list items')
  assert.match(src, /import TruncatedName from '\.\/TruncatedName'/, 'must reuse the shared TruncatedName tooltip')
  assert.match(src, /<TruncatedName name=\{c\.name\}/, 'the athlete name must flow through TruncatedName')
  // decorative accent / ordinal are hidden from assistive tech
  assert.match(src, /aria-hidden/, 'decorative accent + ordinal must be aria-hidden')
})

test('#20b public Athletes tab hardcodes no Vietnamese and leaks no raw i18n key', () => {
  const src = read('components/tournaments/public/PublicCompetitors.tsx')
  // new labels route through i18n
  for (const k of ['competitors.count', 'competitors.total_groups', 'competitors.total_athletes']) {
    assert.match(src, new RegExp(`t\\('${k.replace('.', '\\.')}'`), `must render ${k} via i18n`)
  }
  // no hardcoded Vietnamese diacritics in the RENDERED output (strip comments first — code comments
  // are free to describe the tab in Vietnamese; only JSX/string literals must go through i18n)
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(codeOnly, /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i, 'no hardcoded Vietnamese text in rendered output')
})

test('#20c the three new competitors labels exist and are non-empty across all 5 locales', () => {
  for (const loc of LOCALES) {
    const ns = (messages[loc].tournaments as Record<string, Record<string, unknown>>).competitors
    for (const key of ['count', 'total_groups', 'total_athletes']) {
      const v = ns[key]
      assert.equal(typeof v, 'string', `${loc}.tournaments.competitors.${key} must be a string`)
      assert.notEqual((v as string).trim(), '', `${loc}.tournaments.competitors.${key} must not be empty`)
      assert.match(v as string, /\{n\}/, `${loc}.tournaments.competitors.${key} must interpolate {n}`)
    }
  }
})
