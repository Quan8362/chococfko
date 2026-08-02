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

function flatStrings(obj: unknown, prefix = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatStrings(v, prefix ? `${prefix}.${k}` : k),
  )
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

test('#1c i18n: branch titles are exactly Serie A and Serie B in every locale', () => {
  const serieAPaths = [
    'admin_qualification.slot_championship_short',
    'admin_group_knockout.tab_championship',
    'admin_group_knockout.branch_championship',
    'tournaments.bracket.championship',
    'tournaments.podium.championship',
    'admin_downstream_reset.bracket_championship',
  ]
  const serieBPaths = [
    'admin_qualification.slot_consolation_short',
    'admin_group_knockout.tab_consolation',
    'admin_group_knockout.branch_consolation',
    'tournaments.bracket.consolation',
    'tournaments.podium.consolation',
    'admin_downstream_reset.bracket_consolation',
  ]

  for (const locale of LOCALES) {
    for (const path of serieAPaths) assert.equal(getPath(messages[locale], path), 'Serie A', `${locale}.${path}`)
    for (const path of serieBPaths) assert.equal(getPath(messages[locale], path), 'Serie B', `${locale}.${path}`)
  }
})

test('#1d i18n: user-facing tournament copy contains no legacy branch terminology', () => {
  const namespaces = [
    'admin_tournament_events',
    'admin_qualification',
    'admin_group_knockout',
    'tournaments',
    'admin_downstream_reset',
    'admin_rule_change',
  ]
  const legacyTerms = /\b(?:championship|consolation)\b|nhánh vô địch|nhánh an ủi/i

  for (const locale of LOCALES) {
    for (const namespace of namespaces) {
      for (const [path, value] of flatStrings(messages[locale][namespace], namespace)) {
        const visibleCopy = value.replace(/\{[^}]+\}/g, '')
        assert.doesNotMatch(visibleCopy, legacyTerms, `${locale}.${path} still exposes legacy branch terminology`)
      }
    }
  }
})

test('#1e Serie B is gated by a positive quota on public and admin surfaces', () => {
  const publicQueries = read('lib/tournaments/public/queries.ts')
  assert.match(
    publicQueries,
    /caps\.canHaveConsolationBracket\s*&&\s*event\.consolation_qualifiers_per_group\s*>\s*0/,
    'public bracket read model must hide Serie B when its quota is 0',
  )

  const adminQueries = read('lib/tournaments/admin/queries.ts')
  assert.match(
    adminQueries,
    /const consolationEnabled = event\.consolation_qualifiers_per_group > 0/,
    'admin seeding model must hide Serie B when its quota is 0',
  )
  assert.match(
    adminQueries,
    /const consolation = consolationEnabled\s*\?\s*buildBranchSeedState/,
    'admin seeding model must not build an empty Serie B card',
  )
})

test('#1f branch types are translated through shared i18n keys instead of rendered directly', () => {
  const detail = read('components/tournaments/public/TournamentDetail.tsx')
  assert.match(detail, /t\(`bracket\.\$\{b\.bracket\}`\)/, 'public branch heading must use its i18n key')
  assert.doesNotMatch(detail, />\s*\{b\.bracket\}\s*</, 'public UI must not render bracket.type directly')

  const seedEditor = read('components/tournaments/admin/GroupKnockoutSeedEditor.tsx')
  assert.match(seedEditor, /title=\{t\('branch_championship'\)\}/, 'Serie A seed card must use i18n')
  assert.match(seedEditor, /title=\{t\('branch_consolation'\)\}/, 'Serie B seed card must use i18n')
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
