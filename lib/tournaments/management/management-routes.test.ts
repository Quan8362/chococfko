import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Structural + wiring guarantees for the SCOPED tournament management surface (Prompt 15B-2).
// Complements the pure permission unit tests (lib/tournaments/permissions/permissions.test.ts) and
// the action-guard security tests (lib/tournaments/admin/*Security.test.ts). Run from web/ (npm test).
const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

const LIST = 'app/quan-ly-giai-dau/page.tsx'
const DETAIL = 'app/quan-ly-giai-dau/[id]/page.tsx'
const EVENT = 'app/quan-ly-giai-dau/[id]/noi-dung/[eventId]/page.tsx'
const NEW = 'app/quan-ly-giai-dau/new/page.tsx'
const T_EDIT = 'app/quan-ly-giai-dau/[id]/edit/page.tsx'
const EV_NEW = 'app/quan-ly-giai-dau/[id]/noi-dung/new/page.tsx'
const EV_EDIT = 'app/quan-ly-giai-dau/[id]/noi-dung/[eventId]/edit/page.tsx'
const ACCESS = 'app/quan-ly-giai-dau/_access.ts'
const MEMBERS_ACTIONS = 'app/quan-ly-giai-dau/[id]/members-actions.ts'
const NOI_ACTIONS = 'app/admin/giai-dau/[id]/noi-dung/actions.ts'
const T_ACTIONS = 'app/admin/giai-dau/actions.ts'
const SERVER = 'lib/tournaments/permissions/server.ts'
const SERVICE = 'lib/tournaments/members/service.ts'
const NAV = 'components/Nav.tsx'
const MOBILE = 'components/MobileMenu.tsx'
const PANEL = 'components/tournaments/admin/TournamentMembersPanel.tsx'
const EV_WS = 'components/tournaments/admin/EventWorkspace.tsx'

// ── 1. Anonymous cannot reach management (login redirect) ─────────────────────────────────────
test('anonymous is redirected to login on every management route', () => {
  const list = read(LIST)
  assert.ok(/if \(!auth\.user\)/.test(list) && list.includes('/login?next='), 'list must redirect anon to login')
  for (const f of [DETAIL, EVENT, T_EDIT, EV_NEW, EV_EDIT, NEW]) {
    const src = read(f)
    assert.ok(src.includes('isSignedIn') && src.includes('/login?next='), `${f} must login-redirect anonymous`)
  }
})

// ── 2. Authenticated but unauthorized is blocked (not-found, not revealed) ────────────────────
test('a signed-in non-member gets notFound (never the workspace) on scoped routes', () => {
  for (const f of [DETAIL, EVENT, T_EDIT, EV_NEW, EV_EDIT]) {
    const src = read(f)
    assert.ok(src.includes('resolveTournamentCapabilities'), `${f} must resolve scoped capabilities`)
    assert.ok(src.includes('notFound()'), `${f} must notFound() a signed-in non-member`)
  }
})

// ── 3 & 4. Managers/scorekeepers see ONLY their assigned tournaments ──────────────────────────
test('listManageableTournaments is scoped by ACTIVE membership for non-admins', () => {
  const src = read(SERVICE)
  const fn = src.slice(src.indexOf('export async function listManageableTournaments'))
  assert.ok(fn.includes('checkIsAdmin'), 'must branch on Site Admin')
  // Site Admin → all tournaments; scoped → filter active memberships and .in(ids)
  assert.ok(fn.includes("m.status === 'active'"), 'scoped list must require ACTIVE membership')
  assert.ok(fn.includes(".in('id', ids)"), 'scoped list must restrict to the membership tournament ids')
})

// ── 5. Cross-tournament access is impossible (per-(tournament,user) resolution) ───────────────
test('capability resolution is scoped per (tournament_id, user_id) — no cross-tournament IDOR', () => {
  const src = read(SERVER)
  const fn = src.slice(src.indexOf('async function resolveMembership'))
  assert.ok(fn.includes(".eq('tournament_id', tournamentId)") && fn.includes(".eq('user_id', userId)"),
    'membership lookup must filter by BOTH tournament_id and user_id')
})

// ── 6. Managers never enter /admin; only Site Admin may CREATE a tournament ────────────────────
test('tournament creation is Site-Admin only (no implicit owner for managers)', () => {
  const src = read(NEW)
  assert.ok(src.includes('checkIsAdmin'), 'new-tournament page must gate on checkIsAdmin (Site Admin only)')
  // The create action itself stays Site-Admin-only.
  const actions = read(T_ACTIONS)
  const create = actions.slice(actions.indexOf('function createTournament'), actions.indexOf('function createTournament') + 300)
  assert.ok(create.includes('checkIsAdmin'), 'createTournament must remain Site-Admin-only')
  assert.ok(!create.includes('may('), 'createTournament must NOT use the scoped may() guard')
})

// ── 7. Scorekeeper gets score-only workspace ──────────────────────────────────────────────────
test('event page maps role → workspace capabilities and workspace filters tabs by them', () => {
  const ev = read(EVENT)
  assert.ok(ev.includes('eventWorkspaceCaps(caps)') && ev.includes('knockoutWorkspaceCaps(caps)'),
    'event page must pass capability-derived workspace caps')
  const access = read(ACCESS)
  const map = access.slice(access.indexOf('export function eventWorkspaceCaps'))
  assert.ok(map.includes("caps.can('score.manage')") && map.includes("caps.can('competitor.manage')"),
    'eventWorkspaceCaps must derive from the concrete permissions')
  const ws = read(EV_WS)
  assert.ok(ws.includes('c.score !== false') && ws.includes('c.competitors !== false'),
    'EventWorkspace must gate tabs by caps')
})

// ── 8. Managers/scorekeepers never see member management ──────────────────────────────────────
test('member management panel is rendered ONLY for Site Admin', () => {
  const src = read(DETAIL)
  assert.ok(src.includes('caps.siteAdmin && membersResult'), 'members panel must require caps.siteAdmin')
  assert.ok(src.includes('caps.siteAdmin ? await listTournamentMembersForSiteAdmin'),
    'member roster must be fetched only for Site Admin')
})

// ── 9. Site Admin sees the member tab ─────────────────────────────────────────────────────────
test('detail page imports and can render the member panel', () => {
  const src = read(DETAIL)
  assert.ok(src.includes('TournamentMembersPanel'), 'detail must include the member panel')
})

// ── 10. Site Admin invite / change-role / revoke are wired to the guarded service ─────────────
test('member actions delegate to the members.manage-guarded service', () => {
  const src = read(MEMBERS_ACTIONS)
  assert.match(src, /^'use server'/)
  for (const fn of ['inviteMemberAction', 'changeMemberRoleAction', 'revokeMemberAction']) {
    assert.ok(src.includes(`export async function ${fn}`), `missing ${fn}`)
  }
  for (const svc of ['inviteTournamentMember', 'changeTournamentMemberRole', 'revokeTournamentMember']) {
    assert.ok(src.includes(svc), `must delegate to ${svc}`)
  }
  // The service gates every mutation on members.manage.
  const service = read(SERVICE)
  for (const svc of ['inviteTournamentMember', 'changeTournamentMemberRole', 'revokeTournamentMember']) {
    const body = service.slice(service.indexOf(`export async function ${svc}`), service.indexOf(`export async function ${svc}`) + 300)
    assert.ok(body.includes("checkTournamentPermission(tournamentId, 'members.manage')"),
      `${svc} must gate on members.manage`)
  }
})

// ── 11. Invitations are claimed by verified email only (never a client user_id) ───────────────
test('claim flow runs on the list and binds only the caller’s verified email', () => {
  const list = read(LIST)
  assert.ok(list.includes('claimCurrentUserTournamentInvitations'), 'list must run the claim flow')
  const service = read(SERVICE)
  const claim = service.slice(service.indexOf('export async function claimCurrentUserTournamentInvitations'))
  assert.ok(claim.includes("supabase.rpc('tournament_claim_member_invitations')"),
    'claim must use the SECURITY DEFINER RPC (auth.uid()+JWT email)')
  assert.ok(!/user_id\s*:/.test(claim.slice(0, 600)), 'claim must not pass a client user_id')
})

// ── 12. A revoked membership loses access (only ACTIVE grants permissions) ─────────────────────
test('only an ACTIVE membership confers permissions (revoked/pending grant nothing)', () => {
  const check = read('lib/tournaments/permissions/check.ts')
  const fn = check.slice(check.indexOf('export function resolvePermissions'))
  assert.ok(fn.includes("m.status === 'active'"), 'resolvePermissions must require ACTIVE status')
})

// ── 13. Navigation capability is correct on desktop + mobile ──────────────────────────────────
test('nav shows management entry only to Site Admin or an active member', () => {
  const nav = read(NAV)
  assert.ok(nav.includes('viewerHasActiveTournamentRole'), 'nav must probe active membership')
  assert.ok(nav.includes('isAdmin || (await viewerHasActiveTournamentRole())'),
    'canManageTournaments = admin OR active member')
  assert.ok(nav.includes('canManageTournaments') && nav.includes("t('manage_tournaments')"),
    'desktop nav must gate the management entry')
  const mobile = read(MOBILE)
  assert.ok(mobile.includes('canManageTournaments') && mobile.includes("t('manage_tournaments')"),
    'mobile menu must gate the management entry')
})

// ── 14. Every noi-dung mutation guards a scoped permission before the service-role client ──────
test('each event/competitor/group/bracket/score/tie action maps to the right permission', () => {
  const src = read(NOI_ACTIONS)
  const expected: Record<string, string> = {
    createTournamentEvent: 'event.manage',
    updateTournamentEvent: 'event.manage',
    deleteTournamentEvent: 'event.manage',
    reorderTournamentEvents: 'event.manage',
    createCompetitor: 'competitor.manage',
    updateCompetitor: 'competitor.manage',
    deleteCompetitor: 'competitor.manage',
    reorderCompetitors: 'competitor.manage',
    bulkCreateCompetitors: 'competitor.manage',
    initializeTournamentGroups: 'group.manage',
    saveGroupAssignments: 'group.manage',
    generateGroupMatches: 'bracket.manage',
    regenerateGroupMatches: 'bracket.manage',
    saveGroupMatchResult: 'score.manage',
    clearGroupMatchResult: 'score.manage',
    saveQualificationOverride: 'tie.manage',
    deleteQualificationOverride: 'tie.manage',
    saveKnockoutSeeds: 'bracket.manage',
    clearKnockoutSeeds: 'bracket.manage',
    generateKnockoutBracket: 'bracket.manage',
    resetKnockoutBracket: 'bracket.manage',
    saveKnockoutMatchResult: 'score.manage',
    clearKnockoutMatchResult: 'score.manage',
    saveGroupKnockoutSeeds: 'bracket.manage',
    clearGroupKnockoutSeeds: 'bracket.manage',
    generateGroupKnockoutBrackets: 'bracket.manage',
    resetGroupKnockoutBrackets: 'bracket.manage',
    saveGroupKnockoutMatchResult: 'score.manage',
    clearGroupKnockoutMatchResult: 'score.manage',
    previewAffectedKnockoutPath: 'score.manage',
    resetAffectedKnockoutPath: 'score.manage',
  }
  for (const [fn, perm] of Object.entries(expected)) {
    const start = src.indexOf(`export async function ${fn}(`)
    assert.ok(start > -1, `missing action ${fn}`)
    const body = src.slice(start, start + 600)
    assert.ok(body.includes(`may(tournamentId, '${perm}')`), `${fn} must guard on ${perm}`)
  }
  // The scoped guard precedes the first service-role client in the module.
  const firstGuard = src.indexOf('checkTournamentPermission')
  const firstAdmin = src.indexOf('createAdminClient(')
  assert.ok(firstGuard > -1 && firstGuard < firstAdmin, 'permission guard must precede service-role client')
})

// ── 15. Existing tournament-entity guards map to the right permissions ────────────────────────
test('tournament-entity actions guard update/publish/archive/delete on scoped permissions', () => {
  const src = read(T_ACTIONS)
  const update = src.slice(src.indexOf('function updateTournament'), src.indexOf('function updateTournament') + 300)
  assert.ok(update.includes("may(id, 'tournament.update')"), 'update → tournament.update')
  assert.ok(src.includes("permission: 'tournament.publish'"), 'publish → tournament.publish')
  assert.ok(src.includes("permission: 'tournament.archive'"), 'archive → tournament.archive')
  const del = src.slice(src.indexOf('function deleteDraftTournament'), src.indexOf('function deleteDraftTournament') + 300)
  assert.ok(del.includes("may(id, 'tournament.delete')"), 'delete → tournament.delete')
})

// ── UI safety: the member panel never pulls a service-role / server-only import into the client ─
test('member panel is a client component with no server-only import', () => {
  const src = read(PANEL)
  assert.match(src, /^'use client'/)
  assert.ok(!src.includes('@/lib/supabase/admin'), 'client panel must not import the service-role client')
  assert.ok(!src.includes('permissions/server'), 'client panel must not import the server permission resolver')
})
