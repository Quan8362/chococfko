import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural guarantees for the redesigned PUBLIC tournament discovery page (`/giai-dau`) that can't
// be pure-function unit tests but must hold (render shape, create-CTA wiring, no-draft leakage,
// i18n-key completeness). Run from web/ (npm test). These lock the premium-list redesign so a later
// refactor can't silently drop the CTA, leak drafts, or ship a raw i18n key.
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const PAGE = 'app/giai-dau/page.tsx'
const DISCOVERY = 'components/tournaments/public/TournamentDiscovery.tsx'
const CARD = 'components/tournaments/public/TournamentCard.tsx'

// The hero must render the create-tournament CTA, pointing at the self-service create route (which
// itself performs the login→return-here redirect for anonymous visitors — so no auth branch here).
test('hero renders the create-tournament CTA to the self-service route', () => {
  const src = read(PAGE)
  assert.ok(src.includes("'/quan-ly-giai-dau/new'"), 'create CTA targets /quan-ly-giai-dau/new')
  assert.ok(src.includes("t('public.create_cta')"), 'create CTA uses the public.create_cta label')
})

// The "my tournaments" secondary CTA appears only for signed-in users, and reads auth purely to
// choose that — visibility of the tournament LIST stays anon + RLS (listPublicTournaments only).
test('my-tournaments CTA is gated on sign-in without changing list visibility', () => {
  const src = read(PAGE)
  assert.ok(src.includes('isSignedIn') && src.includes("t('public.my_tournaments')"), 'gated my-tournaments CTA')
  assert.ok(src.includes('listPublicTournaments()'), 'list still comes from the anon RLS query')
  // The page must NOT branch tournament visibility on admin/auth.
  assert.ok(!src.includes('checkIsAdmin'), 'page must not gate the list on admin status')
})

// The page delegates search/filter/sort to the tested pure module + client toolbar — no bespoke
// re-implementation of the ordering/filtering algorithm inside the page.
test('page composes the discovery toolbar over the shared pure filter module', () => {
  const src = read(PAGE)
  assert.ok(src.includes('TournamentDiscovery'), 'renders the discovery toolbar/grid')
  const disc = read(DISCOVERY)
  assert.ok(disc.includes('filterAndSortTournaments') && disc.includes('phaseCounts'), 'reuses the pure filter module')
})

// Card is a single link to the tournament detail; the whole card is the tap target (no nested
// interactive elements) and its accessible name is wired via the heading.
test('card links to the tournament detail with an accessible name', () => {
  const src = read(CARD)
  assert.ok(src.includes('`/giai-dau/${item.slug}`'), 'card links to /giai-dau/<slug>')
  assert.ok(src.includes('aria-labelledby'), 'card link has an accessible name via aria-labelledby')
  assert.ok(src.includes('line-clamp-2') && src.includes('title={item.name}'), 'long names clamp to 2 lines with a full title')
})

// No draft/archived leakage: the page renders ONLY what listPublicTournaments returns (published +
// completed under RLS) and never references a draft/archived status or a service-role client.
test('discovery page never surfaces drafts or uses the service-role client', () => {
  const src = read(PAGE)
  assert.ok(!src.includes('createAdminClient'), 'no service-role admin client on the public page')
  assert.ok(!/['"]draft['"]/.test(src) && !/['"]archived['"]/.test(src), 'no draft/archived status referenced')
})

// Every `t('public.<key>')` / `t('status.<key>')` referenced by the page + client components must
// exist in the base (vi) locale — guards against a raw i18n key shipping to users.
test('all referenced tournament i18n keys exist in the base locale', () => {
  const messages = JSON.parse(read('messages/vi.json'))
  const tournaments = messages.tournaments as Record<string, unknown>
  const has = (dotted: string): boolean => {
    let node: unknown = tournaments
    for (const part of dotted.split('.')) {
      if (typeof node !== 'object' || node === null) return false
      node = (node as Record<string, unknown>)[part]
    }
    return typeof node === 'string'
  }
  const referenced = new Set<string>()
  // Only match STATIC string keys, e.g. t('public.search_label'); template-literal keys
  // (t(`public.phase.${p}`)) are asserted separately below.
  const re = /\bt\(\s*'((?:public|status)\.[a-z_.]+)'/g
  for (const file of [PAGE, DISCOVERY, CARD]) {
    const src = read(file)
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) referenced.add(m[1])
  }
  const missing = [...referenced].filter((k) => !has(k))
  assert.deepEqual(missing, [], `missing i18n keys: ${missing.join(', ')}`)

  // Dynamic key families used via template literals must be fully populated.
  for (const k of ['recommended', 'newest', 'start_asc', 'start_desc']) assert.ok(has(`public.sort.${k}`), `public.sort.${k}`)
  for (const k of ['all', 'ongoing', 'upcoming', 'completed']) assert.ok(has(`public.phase.${k}`), `public.phase.${k}`)
  for (const k of ['ongoing', 'upcoming', 'completed']) assert.ok(has(`status.${k}`), `status.${k}`)
})
