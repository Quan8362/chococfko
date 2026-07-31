// Prompt 15B-2E — SCOPED TOURNAMENT MANAGEMENT permission UI verification (browser gate).
//
// Closes the browser gate for the scoped management surface (/quan-ly-giai-dau): the ROUTE-level and
// UI-level enforcement of the 15B permission model, exercised end-to-end against the LOCAL stack.
//   • Site Admin (ADMIN_EMAILS)  → every tournament + member management + hard-delete of drafts.
//   • Manager (active member)     → their tournaments only; edit/score; NO member panel, NO hard-delete;
//                                   a foreign tournament is a hard 404 (never leaks its data).
//   • Scorekeeper (active member) → their tournaments; score-only workspace; no edit/status/member.
//   • Regular user / anonymous    → no scoped access at all (empty list / login redirect / 404).
//   • Invitation claim            → pending→active on first visit, exactly once, wrong email can't claim,
//                                   revoked invites are never claimable.
//   • Revocation                  → removing an active member immediately closes the private workspace
//                                   while the public tournament page stays visible.
//
// Security is the SERVER's job (checkTournamentPermission re-checks every mutation); these tests verify
// the routes and the convenience UI honour that model and never expose a foreign tournament's data.
//
// Data is seeded via the service role (deterministic starting states) under RUN_PREFIX; afterAll wipes
// it (ON DELETE CASCADE also removes the membership rows). The browser itself NEVER touches the
// membership table — assertSecure() proves that on every authenticated flow.

import { test, expect, type Page } from '@playwright/test'
import {
  adminStateFile, userStateFile, managerStateFile, scorekeeperStateFile, inviteeStateFile,
  MANAGER_EMAIL, SCOREKEEPER_EMAIL, INVITEE_EMAIL,
} from './_env'
import { t, attachGuard, assertSecure } from './helpers'
import {
  createTournament, addEvent, seedPublishedRoundRobin,
  authUserIdByEmail, seedActiveMember, invitePendingMember, seedRevokedMember,
  getMemberSnapshot, cleanupRun, type TournamentHandle,
} from './seed'

const BASE = '/quan-ly-giai-dau'
const PUBLIC = '/giai-dau'

// Shared fixture handles (seeded once in beforeAll).
let A: TournamentHandle            // published, round-robin completed; manager + scorekeeper active
let B: TournamentHandle            // published; NO scoped members (the cross-tournament target)
let draftA: TournamentHandle       // draft, 0 events; manager active (proves the role delete-gate)
let D: TournamentHandle            // published; manager active (revocation scenario, isolated from A)
let eventAId: string
let eventBId: string
let managerId: string
let scorekeeperId: string

// A visible tournament card / detail header carries the tournament name in a heading.
const heading = (page: Page, name: string) => page.getByRole('heading', { name })

test.beforeAll(async () => {
  managerId = await authUserIdByEmail(MANAGER_EMAIL)
  scorekeeperId = await authUserIdByEmail(SCOREKEEPER_EMAIL)

  // A — a published round-robin whose single group is already completed (so a scorekeeper has a
  // Results/Standings workspace to see).
  const rr = await seedPublishedRoundRobin({ completed: true })
  A = rr.tournament
  eventAId = rr.event.id
  await seedActiveMember({ tournamentId: A.id, email: MANAGER_EMAIL, role: 'manager', userId: managerId })
  await seedActiveMember({ tournamentId: A.id, email: SCOREKEEPER_EMAIL, role: 'scorekeeper', userId: scorekeeperId })

  // B — a foreign tournament neither scoped role belongs to.
  B = await createTournament({ status: 'published', label: 'permB' })
  const evB = await addEvent(B.id, { format: 'round_robin', label: 'B', groupCount: 1 })
  eventBId = evB.id

  // draftA — a DRAFT (0 events) the manager is active in; hard-delete only ever renders for drafts, so
  // this is where "manager has no delete but Site Admin does" is a meaningful comparison.
  draftA = await createTournament({ status: 'draft', label: 'permDraft' })
  await seedActiveMember({ tournamentId: draftA.id, email: MANAGER_EMAIL, role: 'manager', userId: managerId })

  // D — published, manager active; used by the revocation test so revoking never disturbs A.
  D = await createTournament({ status: 'published', label: 'permRevoke' })
  await addEvent(D.id, { format: 'round_robin', label: 'D', groupCount: 1 })
  await seedActiveMember({ tournamentId: D.id, email: MANAGER_EMAIL, role: 'manager', userId: managerId })
})

test.afterAll(async () => {
  await cleanupRun()
})

// ── Anonymous ─────────────────────────────────────────────────────────────────────────────────
test.describe('anonymous', () => {
  test('list and detail redirect to login and reveal nothing private', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await expect(page).toHaveURL(/\/login/)
    await expect(heading(page, t('tournament_management.list_title'))).toHaveCount(0)

    await page.goto(`${BASE}/${A.id}`)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(A.name)).toHaveCount(0)
    assertSecure(g)
  })
})

// ── Regular signed-in user with NO membership ────────────────────────────────────────────────────
test.describe('regular user (no membership)', () => {
  test.use({ storageState: userStateFile })

  test('lands on an empty scoped list — no create CTA, no tournaments', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await expect(page).toHaveURL(/\/quan-ly-giai-dau/)
    await expect(page.getByText(t('tournament_management.empty_sub_scoped'))).toBeVisible()
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') })).toHaveCount(0)
    await expect(heading(page, A.name)).toHaveCount(0)
    assertSecure(g)
  })

  test('cannot open a workspace by direct URL (404, no data)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/${A.id}`)
    expect(resp?.status()).toBe(404)
    await expect(page.getByText(A.name)).toHaveCount(0)
  })
})

// ── Site Admin ────────────────────────────────────────────────────────────────────────────────
test.describe('site admin', () => {
  test.use({ storageState: adminStateFile })

  test('sees every tournament and the create CTA', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') }).first()).toBeVisible()
    await expect(heading(page, A.name)).toBeVisible()
    await expect(heading(page, B.name)).toBeVisible()
    assertSecure(g)
  })

  test('reaches the site-admin module (/admin/giai-dau)', async ({ page }) => {
    await page.goto('/admin/giai-dau')
    await expect(page).toHaveURL(/\/admin\/giai-dau/)
  })

  test('tournament detail shows the member panel', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(`${BASE}/${A.id}`)
    await expect(heading(page, A.name)).toBeVisible()
    await expect(page.getByText(t('tournament_management.you_are_site_admin')).first()).toBeVisible()
    await expect(page.getByText(t('tournament_members.section_title'))).toBeVisible()
    assertSecure(g)
  })

  test('draft tournament exposes hard-delete', async ({ page }) => {
    await page.goto(`${BASE}/${draftA.id}`)
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_delete') })).toBeVisible()
  })

  test('can invite a scoped member (write path reflected in the DB)', async ({ page }) => {
    await page.goto(`${BASE}/${A.id}`)
    const email = `sa-invite-${Date.now()}@chococfko.test`
    await page.locator('#member-email').fill(email)
    await page.locator('#member-role').selectOption('scorekeeper')
    await page.getByRole('button', { name: t('tournament_members.invite_cta') }).click()
    await expect(page.getByText(t('tournament_members.invited_ok'))).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    const snap = await getMemberSnapshot({ tournamentId: A.id, email })
    expect(snap?.status).toBe('pending')
    expect(snap?.role).toBe('scorekeeper')
  })
})

// ── Manager (active member of A) ────────────────────────────────────────────────────────────────
test.describe('manager', () => {
  test.use({ storageState: managerStateFile })

  test('list shows their tournaments (A) but not a foreign one (B) and no create CTA', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await expect(heading(page, A.name)).toBeVisible()
    await expect(heading(page, B.name)).toHaveCount(0)
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') })).toHaveCount(0)
    assertSecure(g)
  })

  test('detail: can edit, but NO member panel', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(`${BASE}/${A.id}`)
    await expect(heading(page, A.name)).toBeVisible()
    await expect(page.getByText(t('tournament_management.you_are_manager')).first()).toBeVisible()
    await expect(page.getByRole('link', { name: t('admin_tournaments.action_edit') }).first()).toBeVisible()
    await expect(page.getByText(t('tournament_members.section_title'))).toHaveCount(0)
    assertSecure(g)
  })

  test('draft detail: publish/archive allowed, hard-delete withheld', async ({ page }) => {
    await page.goto(`${BASE}/${draftA.id}`)
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_publish') })).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_delete') })).toHaveCount(0)
  })

  test('event workspace exposes competitor + score management', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(`${BASE}/${A.id}/noi-dung/${eventAId}`)
    await expect(page.getByRole('tab', { name: t('admin_tournament_groups.tab_competitors') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('admin_group_standings.tab_results') })).toBeVisible()
    await expect(page.getByRole('link', { name: t('admin_tournament_events.edit_settings') })).toBeVisible()
    assertSecure(g)
  })

  test('a foreign tournament (B) is a hard 404 — its data never renders', async ({ page }) => {
    const resp = await page.goto(`${BASE}/${B.id}`)
    expect(resp?.status()).toBe(404)
    await expect(page.getByText(B.name)).toHaveCount(0)

    const evResp = await page.goto(`${BASE}/${B.id}/noi-dung/${eventBId}`)
    expect(evResp?.status()).toBe(404)
    await expect(page.getByText(B.name)).toHaveCount(0)
  })

  test('the site-admin module bounces a manager', async ({ page }) => {
    await page.goto('/admin/giai-dau')
    await expect(page).toHaveURL(/\/$/)
    await expect(page).not.toHaveURL(/\/admin\/giai-dau/)
  })
})

// ── Scorekeeper (active member of A) ─────────────────────────────────────────────────────────────
test.describe('scorekeeper', () => {
  test.use({ storageState: scorekeeperStateFile })

  test('list shows only their tournament (A)', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await expect(heading(page, A.name)).toBeVisible()
    await expect(heading(page, B.name)).toHaveCount(0)
    await expect(heading(page, draftA.name)).toHaveCount(0)
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') })).toHaveCount(0)
    assertSecure(g)
  })

  test('detail is view-only: no edit, no member panel, no status actions', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(`${BASE}/${A.id}`)
    await expect(page.getByText(t('tournament_management.you_are_scorekeeper')).first()).toBeVisible()
    await expect(page.getByRole('link', { name: t('admin_tournaments.action_edit') })).toHaveCount(0)
    await expect(page.getByText(t('tournament_members.section_title'))).toHaveCount(0)
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_publish') })).toHaveCount(0)
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_archive') })).toHaveCount(0)
    assertSecure(g)
  })

  test('event workspace is score-only (results tab, no competitor tab, no edit-settings)', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(`${BASE}/${A.id}/noi-dung/${eventAId}`)
    await expect(page.getByRole('tab', { name: t('admin_group_standings.tab_results') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('admin_tournament_groups.tab_competitors') })).toHaveCount(0)
    await expect(page.getByRole('link', { name: t('admin_tournament_events.edit_settings') })).toHaveCount(0)
    assertSecure(g)
  })

  test('a foreign tournament (B) is a hard 404', async ({ page }) => {
    const resp = await page.goto(`${BASE}/${B.id}`)
    expect(resp?.status()).toBe(404)
    await expect(page.getByText(B.name)).toHaveCount(0)
  })
})

// ── Invitation claim ─────────────────────────────────────────────────────────────────────────────
test.describe('invitation claim', () => {
  let C: TournamentHandle

  test.beforeAll(async () => {
    // A pending invite addressed to the invitee's email, plus a REVOKED invite (in B) that must never
    // be claimable.
    C = await createTournament({ status: 'published', label: 'permClaim' })
    await addEvent(C.id, { format: 'round_robin', label: 'C', groupCount: 1 })
    await invitePendingMember({ tournamentId: C.id, email: INVITEE_EMAIL, role: 'manager' })
    await seedRevokedMember({ tournamentId: B.id, email: INVITEE_EMAIL, role: 'manager' })
  })

  // Declared FIRST so it runs while the invite is still pending: a DIFFERENT email must not claim it.
  test.describe('a different email cannot claim the invitation', () => {
    test.use({ storageState: userStateFile })
    test('the wrong user never sees C and leaves the invite pending', async ({ page }) => {
      const g = attachGuard(page)
      await page.goto(BASE)
      await expect(heading(page, C.name)).toHaveCount(0)
      const snap = await getMemberSnapshot({ tournamentId: C.id, email: INVITEE_EMAIL })
      expect(snap?.status).toBe('pending')
      expect(snap?.userId).toBeNull()
      assertSecure(g)
    })
  })

  test.describe('the invitee claims on first visit', () => {
    test.use({ storageState: inviteeStateFile })
    test('claim binds exactly once; reload does not loop; revoked invites stay unclaimed', async ({ page }) => {
      const g = attachGuard(page)
      await page.goto(BASE)
      // C is now managed (claimed during the list render) — the invitee never passed a user_id.
      await expect(heading(page, C.name)).toBeVisible()
      const snap = await getMemberSnapshot({ tournamentId: C.id, email: INVITEE_EMAIL })
      expect(snap?.status).toBe('active')
      expect(snap?.userId).not.toBeNull()
      const versionAfterClaim = snap!.version

      // Reload — the claim RPC only touches PENDING rows, so an already-active membership is untouched
      // (no version bump ⇒ no claim loop).
      await page.reload()
      await expect(heading(page, C.name)).toBeVisible()
      const snap2 = await getMemberSnapshot({ tournamentId: C.id, email: INVITEE_EMAIL })
      expect(snap2?.status).toBe('active')
      expect(snap2?.version).toBe(versionAfterClaim)

      // The revoked invitation (in B) is never claimed → B is not managed and stays revoked.
      await expect(heading(page, B.name)).toHaveCount(0)
      const bSnap = await getMemberSnapshot({ tournamentId: B.id, email: INVITEE_EMAIL })
      expect(bSnap?.status).toBe('revoked')
      assertSecure(g)
    })
  })
})

// ── Revocation (two live browser contexts) ───────────────────────────────────────────────────────
test.describe('revocation', () => {
  test('revoking an active member immediately closes their workspace; the public page stays open', async ({ browser }) => {
    const managerCtx = await browser.newContext({ storageState: managerStateFile })
    const adminCtx = await browser.newContext({ storageState: adminStateFile })
    const mPage = await managerCtx.newPage()
    const aPage = await adminCtx.newPage()
    try {
      // Manager currently has the workspace for D.
      await mPage.goto(`${BASE}/${D.id}`)
      await expect(heading(mPage, D.name)).toBeVisible()

      // Site Admin revokes the manager through the member panel UI.
      await aPage.goto(`${BASE}/${D.id}`)
      const row = aPage.locator('tr', { hasText: MANAGER_EMAIL })
      await row.getByRole('button', { name: t('tournament_members.revoke') }).click()
      await aPage.getByRole('dialog').getByRole('button', { name: t('tournament_members.revoke') }).click()
      await expect(aPage.getByText(t('tournament_members.revoked_ok'))).toBeVisible()
      await expect
        .poll(async () => (await getMemberSnapshot({ tournamentId: D.id, email: MANAGER_EMAIL }))?.status)
        .toBe('revoked')

      // Manager re-navigates → access is gone (hard 404, no D data leaked).
      const resp = await mPage.goto(`${BASE}/${D.id}`)
      expect(resp?.status()).toBe(404)
      await expect(mPage.getByText(D.name)).toHaveCount(0)

      // …but the PUBLIC tournament page still renders for the same (now-unprivileged) viewer.
      const pubResp = await mPage.goto(`${PUBLIC}/${D.slug}`)
      expect(pubResp?.status()).toBe(200)
      await expect(mPage.getByText(D.name).first()).toBeVisible()
    } finally {
      await mPage.close().catch(() => {})
      await aPage.close().catch(() => {})
      await managerCtx.close()
      await adminCtx.close()
    }
  })
})

// ── Navigation + responsive ──────────────────────────────────────────────────────────────────────
test.describe('navigation (mobile)', () => {
  test.describe('manager sees the management entry', () => {
    test.use({ storageState: managerStateFile, viewport: { width: 390, height: 844 } })
    test('the mobile menu exposes "Quản lý giải đấu"', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: t('nav.open_menu') }).click()
      await expect(page.getByRole('link', { name: t('nav.manage_tournaments') })).toBeVisible()
    })
  })

  test.describe('a regular user does not', () => {
    test.use({ storageState: userStateFile, viewport: { width: 390, height: 844 } })
    test('the mobile menu has no management entry', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: t('nav.open_menu') }).click()
      await expect(page.getByRole('link', { name: t('nav.manage_tournaments') })).toHaveCount(0)
    })
  })
})

test.describe('responsive — no full-page horizontal overflow', () => {
  test.use({ storageState: adminStateFile })
  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile portrait', width: 390, height: 844 },
    { name: 'mobile landscape', width: 844, height: 390 },
  ]
  for (const vp of viewports) {
    test(`member panel + list fit at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(`${BASE}/${A.id}`)
      await expect(page.getByText(t('tournament_members.section_title'))).toBeVisible()
      // The wide member TABLE scrolls inside its own overflow-x container — the page body must not.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'document should not scroll horizontally').toBeLessThanOrEqual(1)
    })
  }
})

// ── Console & network (strict) ───────────────────────────────────────────────────────────────────
test.describe('console & network (strict)', () => {
  test.use({ storageState: adminStateFile })
  test('the full admin flow raises no console/network violations', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(BASE)
    await page.goto(`${BASE}/${A.id}`)
    await page.goto(`${BASE}/${A.id}/noi-dung/${eventAId}`)
    await expect(page.getByRole('tab', { name: t('admin_group_standings.tab_results') })).toBeVisible()
    g.assertClean()
  })
})
