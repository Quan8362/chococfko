// ════════════════════════════════════════════════════════════════════════════════════
// TOURNAMENT BRANCH LABELS — Serie A / Serie B i18n GUARDS
// ════════════════════════════════════════════════════════════════════════════════════
// The two knockout branches are presented to users as "Serie A" (championship) and "Serie B"
// (consolation). The internal domain values (championship / consolation) are unchanged — this only
// guards the user-facing copy in all five locales so the legacy branch wording cannot creep back.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj)
}
function flatStrings(obj: unknown, prefix = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatStrings(v, prefix ? `${prefix}.${k}` : k),
  )
}

// The canonical branch-title paths must read exactly "Serie A" / "Serie B" in every locale.
test('branch titles are exactly Serie A and Serie B in every locale', () => {
  const serieA = [
    'admin_qualification.slot_championship_short',
    'admin_group_knockout.tab_championship',
    'admin_group_knockout.branch_championship',
    'tournaments.bracket.championship',
    'tournaments.podium.championship',
    'admin_downstream_reset.bracket_championship',
  ]
  const serieB = [
    'admin_qualification.slot_consolation_short',
    'admin_group_knockout.tab_consolation',
    'admin_group_knockout.branch_consolation',
    'tournaments.bracket.consolation',
    'tournaments.podium.consolation',
    'admin_downstream_reset.bracket_consolation',
  ]
  for (const locale of LOCALES) {
    for (const p of serieA) assert.equal(getPath(messages[locale], p), 'Serie A', `${locale}.${p}`)
    for (const p of serieB) assert.equal(getPath(messages[locale], p), 'Serie B', `${locale}.${p}`)
  }
})

// No user-facing tournament copy may expose the legacy English branch words or the old VI phrases.
// Interpolation placeholders (e.g. {consolation}) are stripped before the check — they are variable
// names, never shown.
test('user-facing tournament copy contains no legacy branch terminology', () => {
  const namespaces = [
    'admin_tournament_events',
    'admin_qualification',
    'admin_group_knockout',
    'tournaments',
    'admin_downstream_reset',
    'admin_rule_change',
  ]
  const legacy = /\b(?:championship|consolation)\b|nhánh vô địch|nhánh an ủi/i
  for (const locale of LOCALES) {
    for (const namespace of namespaces) {
      for (const [path, value] of flatStrings(messages[locale][namespace], namespace)) {
        const visible = value.replace(/\{[^}]+\}/g, '')
        assert.doesNotMatch(visible, legacy, `${locale}.${path} still exposes legacy branch terminology`)
      }
    }
  }
})

// The public bracket description must not carry the old "Nhánh tranh chức vô địch / Nhánh an ủi" copy.
test('public bracket descriptions use neutral Serie wording', () => {
  for (const locale of LOCALES) {
    const champDesc = getPath(messages[locale], 'tournaments.bracket.championship_desc') as string
    const consoDesc = getPath(messages[locale], 'tournaments.bracket.consolation_desc') as string
    assert.ok(champDesc && champDesc.trim() !== '', `${locale} championship_desc empty`)
    assert.ok(consoDesc && consoDesc.trim() !== '', `${locale} consolation_desc empty`)
    assert.doesNotMatch(champDesc, /Nhánh tranh chức vô địch/i, `${locale} championship_desc still legacy`)
    assert.doesNotMatch(consoDesc, /Nhánh an ủi/i, `${locale} consolation_desc still legacy`)
  }
})

// The public branch heading is rendered through its i18n key (Serie A/Serie B), never the raw domain
// value, and the two branches keep their own titled sections (no data blending).
test('public detail renders branch headings via i18n keys, not raw domain values', () => {
  const detail = read('components/tournaments/public/TournamentDetail.tsx')
  assert.match(detail, /t\(`bracket\.\$\{b\.bracket\}`\)/, 'branch heading must use its i18n key')
  assert.doesNotMatch(detail, />\s*\{b\.bracket\}\s*</, 'must not render bracket.type directly')
})
