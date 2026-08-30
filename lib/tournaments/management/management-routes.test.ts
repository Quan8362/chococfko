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

// ── 6. Creation is SELF-SERVICE: any signed-in user may create + become owner (15F-1) ──────────
test('tournament creation is self-service (any authenticated user, never Site-Admin-gated)', () => {
  const src = read(NEW)
  assert.ok(src.includes('isSignedIn') && src.includes('/login?next='),
    'new-tournament page must require ONLY sign-in (login-redirect anon)')
  assert.ok(!src.includes('checkIsAdmin'), 'new-tournament page must NOT gate on checkIsAdmin')
  // The create action delegates to the self-service flow and does NOT use checkIsAdmin or may().
  const actions = read(T_ACTIONS)
  const create = actions.slice(actions.indexOf('function createTournament'), actions.indexOf('function createTournament') + 300)
  assert.ok(create.includes('createOwnedTournament'), 'createTournament must delegate to createOwnedTournament')
  assert.ok(!create.includes('checkIsAdmin'), 'createTournament must NOT be Site-Admin-gated')
  assert.ok(!create.includes('may('), 'createTournament must NOT use the scoped may() guard')
  // The self-service service authorizes on authentication (not admin) and uses the DEFINER RPC.
  const svc = read('lib/tournaments/create/service.ts')
  assert.ok(svc.includes('auth.getUser()'), 'create service must authorize on authentication')
  assert.ok(svc.includes("supabase.rpc('tournament_create_self_service'"),
    'create service must use the atomic SECURITY DEFINER RPC')
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

// ── 8. Member management is gated on members.manage (Site Admin OR Owner) — not managers/scorers ─
test('member management panel is rendered ONLY for members.manage holders (Site Admin or Owner)', () => {
  const src = read(DETAIL)
  assert.ok(src.includes("caps.can('members.manage')"), 'members panel must require members.manage')
  assert.ok(src.includes('canManageMembers && membersResult'), 'panel gated by the members.manage flag')
  assert.ok(src.includes('canManageMembers ? await listTournamentMembersForSiteAdmin'),
    'member roster fetched only for members.manage holders')
  // Manager (has no members.manage) and scorekeeper therefore never receive the panel.
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

// ── 13. Navigation: every signed-in user sees "my tournaments" + "create" (self-service) ───────
test('nav shows my-tournaments + create entries to every authenticated user', () => {
  const nav = read(NAV)
  assert.ok(nav.includes('canManageTournaments = true'),
    'canManageTournaments is true for any signed-in user (self-service)')
  assert.ok(nav.includes("t('my_tournaments')") && nav.includes("t('create_tournament')"),
    'desktop nav must expose the my-tournaments + create entries')
  const mobile = read(MOBILE)
  assert.ok(mobile.includes('canManageTournaments') && mobile.includes("t('my_tournaments')") &&
    mobile.includes("t('create_tournament')"),
    'mobile menu must expose the my-tournaments + create entries')
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

// ── 16. Owner protections: owner is never invitable, re-roled or revoked via the member service ─
test('member service protects the owner role (no invite/promote/revoke to or from owner)', () => {
  const src = read(SERVICE)
  const invite = src.slice(src.indexOf('export async function inviteTournamentMember'),
    src.indexOf('export async function changeTournamentMemberRole'))
  assert.ok(invite.includes('isInvitableRole(input.role)'), 'invite must reject the owner role (isInvitableRole)')

  const change = src.slice(src.indexOf('export async function changeTournamentMemberRole'),
    src.indexOf('export async function revokeTournamentMember'))
  assert.ok(change.includes('isInvitableRole(newRole)'), 'role-change target must be an invitable role')
  assert.ok(change.includes("existing.role === 'owner'") && change.includes('cannot_modify_owner'),
    'role-change must refuse to modify an owner row')

  const revoke = src.slice(src.indexOf('export async function revokeTournamentMember'),
    src.indexOf('export async function claimCurrentUserTournamentInvitations'))
  assert.ok(revoke.includes("existing.role === 'owner'") && revoke.includes('cannot_modify_owner'),
    'revoke must refuse to revoke an owner row')
})

// ── 17. The self-service create flow is atomic + draft-only + identity-safe (migration + service) ─
test('self-service create is atomic, draft-only and identity-safe', () => {
  const mig = read('supabase/migration_tournament_owner_self_service.sql')
  assert.ok(mig.includes('SECURITY DEFINER') && mig.includes('search_path = public, pg_temp'),
    'create RPC must be SECURITY DEFINER with a pinned search_path')
  assert.ok(mig.includes('auth.uid()'), 'identity must come from auth.uid(), not a client argument')
  assert.ok(/status[^;]*'draft'/.test(mig), 'tournament must be created as draft')
  assert.ok(mig.includes("'owner'") && mig.includes("'active'"), 'creator becomes an active owner')
  assert.ok(mig.includes('tmem_one_active_owner_uq'), 'at most one active owner per tournament')
  assert.ok(mig.includes('REVOKE ALL ON FUNCTION public.tournament_create_self_service') &&
    mig.includes('FROM PUBLIC, anon'), 'create RPC must be revoked from PUBLIC/anon')
  assert.ok(mig.includes('tournament_created') && mig.includes('tournament_owner_assigned'),
    'both audit rows must be written')
})

// ── 18. Home promo is SITE-ADMIN-ONLY (owner/manager/scorekeeper can never toggle it) ──────────
const PROMO_TOGGLE = 'components/tournaments/admin/TournamentHomePromoToggle.tsx'

test('setTournamentHomePromo is gated on Site Admin (checkIsAdmin), NOT the scoped may() guard', () => {
  const src = read(T_ACTIONS)
  const start = src.indexOf('export async function setTournamentHomePromo(')
  assert.ok(start > -1, 'setTournamentHomePromo action must exist')
  const body = src.slice(start, src.indexOf('function revalidateHomePromo'))
  // Site-Admin re-check on the server — this is the security boundary, not the hidden UI control.
  assert.ok(body.includes('await checkIsAdmin()'), 'must re-check Site Admin on the server')
  assert.ok(body.includes("error: 'forbidden'"), 'must reject non-admins with forbidden')
  // Must NOT use the scoped permission engine — an Owner/Manager must not satisfy this.
  assert.ok(!body.includes('may('), 'must NOT use the scoped may() guard (owner would pass)')
  assert.ok(!body.includes('checkTournamentPermission'), 'must NOT use the scoped permission checker')
  // Optimistic concurrency + audit + home revalidation are wired.
  assert.ok(body.includes(".eq('updated_at', expectedUpdatedAt)"), 'must guard on the updated_at token')
  assert.ok(body.includes('tournament_home_promo_enabled') && body.includes('tournament_home_promo_disabled'),
    'must audit both enable and disable')
  const rev = src.slice(src.indexOf('function revalidateHomePromo'))
  assert.ok(rev.includes("revalidatePath('/')"), 'must revalidate the home page so the strip updates')
})

test('the admin toggle control is rendered ONLY for a Site Admin on the scoped management page', () => {
  // Scoped page: gated behind caps.siteAdmin (owner/manager/scorekeeper never see the control).
  const detail = read(DETAIL)
  assert.ok(detail.includes('caps.siteAdmin && (') && detail.includes('TournamentHomePromoToggle'),
    'scoped detail must render the toggle only when caps.siteAdmin')
  // Legacy admin page is already Site-Admin-gated at the top (checkIsAdmin → redirect).
  const legacy = read('app/admin/giai-dau/[id]/page.tsx')
  assert.ok(legacy.includes('checkIsAdmin') && legacy.includes('TournamentHomePromoToggle'),
    'legacy admin detail (Site-Admin-gated) renders the toggle')
})

test('the promo toggle is a client component with no server-only / service-role import', () => {
  const src = read(PROMO_TOGGLE)
  assert.match(src, /^'use client'/)
  assert.ok(!src.includes('@/lib/supabase/admin'), 'client toggle must not import the service-role client')
  assert.ok(!src.includes('permissions/server'), 'client toggle must not import the server permission resolver')
  // A real accessible switch (status is not conveyed by colour alone).
  assert.ok(src.includes('role="switch"') && src.includes('aria-checked'), 'must be an accessible switch')
})

// ── 19. The home promo strip surfaces admin-opted-in tournaments of ANY phase ──────────────────
test('promo selection is flag-driven (finished tournaments stay until the flag is off)', () => {
  const src = read('lib/tournaments/public/promo.ts')
  assert.ok(src.includes('i.homePromoEnabled'), 'must require the admin opt-in flag')
  // Flag-driven, not phase-driven: a completed tournament keeps showing (with its "Đã kết thúc"
  // status) until the admin turns the flag off, so the selection must NOT filter by phase.
  assert.ok(!/i\.phase === '(ongoing|upcoming)'/.test(src),
    'must not drop tournaments by phase (finished stay promoted while the flag is on)')
  // The public list query projects the flag through the same RLS-gated anon read.
  const q = read('lib/tournaments/public/queries.ts')
  assert.ok(q.includes('home_promo_enabled'), 'public list query must select the flag')
})
