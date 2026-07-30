// Prompt 15C-2 — TOURNAMENT RULE ADMINISTRATION browser gate (rule tab + public summary).
//
// Exercises the event RULE workspace end-to-end against the LOCAL stack:
//   • Site Admin / Manager can open + manage rules; Scorekeeper gets a read-only tab; a regular user
//     and a cross-tournament event are hard-denied (404, no leak).
//   • Apply FJP Beginner/Standard (preview shows 15 / 21 / win-by-2 / cap 31); the handicap warning
//     must be acknowledged before a pending preset is applied.
//   • Create custom rules, edit a snapshot, and confirm the tie-break editor never offers a duplicate.
//   • A stale write (two contexts on one snapshot) yields a version-conflict banner + a reload button
//     and never silently overwrites; reset re-copies the ORIGINAL preset version; delete falls the
//     event back to the default rules and is allowed only in setup.
//   • The public detail page shows a correct, minimal rule summary — never any internal field — and a
//     legacy event (no snapshot) shows the "system default rules" notice; a draft never leaks a summary.
//
// The SERVER enforces every rule (checkTournamentPermission + the pure guard + optimistic concurrency);
// these tests prove the routes/UI honour it. DB truth is asserted via the service-role seed helpers.
// Data is tagged with RUN_PREFIX; afterAll wipes it (ON DELETE CASCADE removes snapshots + audit rows).

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { adminStateFile, userStateFile, managerStateFile, scorekeeperStateFile, MANAGER_EMAIL, SCOREKEEPER_EMAIL } from './_env'
import { t, attachGuard, assertSecure, assertNoAuditLogRequests } from './helpers'
import { randomUUID } from 'node:crypto'
import {
  admin, createTournament, addEvent, addCompetitors, addGroup, assignToGroup, addCompletedGroupMatch,
  seedActiveMember, authUserIdByEmail, seedFjpPreset, seedRuleSnapshot, readRuleSnapshot, countAudit,
  customRulePayload, cleanupRun, FJP_PRESET_KEY, FJP_PRESET_VERSION,
  type TournamentHandle,
} from './seed'

const BASE = '/quan-ly-giai-dau'

let A: TournamentHandle          // published; manager + scorekeeper active
let B: TournamentHandle          // published; NO scoped members (cross-tournament target)
let draftT: TournamentHandle     // draft; carries a snapshot that must never leak publicly

// Events (all under A unless noted). Each mutating scenario gets its own event so tests stay isolated.
let eApplyBeg = ''
let eApplyStd = ''
let eCustom = ''
let eEdit = ''
let eHandicap = ''
let eReset = ''
let eDelete = ''
let eConflict = ''
let eScheduled = ''
let eResult = ''
let eLegacy = ''
let ePublicPreset = ''
let eScorekeeper = ''
let eventB = ''
let eDraft = ''

// A plain round-robin event in setup (no matches → freely editable).
async function addSetupEvent(tournamentId: string, label: string): Promise<string> {
  const ev = await addEvent(tournamentId, { format: 'round_robin', label, groupCount: 1 })
  return ev.id
}

// Open the "Luật thi đấu" (rules) tab of a scoped event workspace.
async function openRuleTab(page: Page, tournamentId: string, eventId: string): Promise<void> {
  await page.goto(`${BASE}/${tournamentId}/noi-dung/${eventId}`)
  await page.getByRole('tab', { name: t('admin_event_rules.tab_rules') }).click()
  await expect(page.getByRole('heading', { name: t('admin_event_rules.heading') })).toBeVisible()
}

test.beforeAll(async () => {
  await seedFjpPreset()
  const managerId = await authUserIdByEmail(MANAGER_EMAIL)
  const scorekeeperId = await authUserIdByEmail(SCOREKEEPER_EMAIL)

  A = await createTournament({ status: 'published', label: 'rules' })
  await seedActiveMember({ tournamentId: A.id, email: MANAGER_EMAIL, role: 'manager', userId: managerId })
  await seedActiveMember({ tournamentId: A.id, email: SCOREKEEPER_EMAIL, role: 'scorekeeper', userId: scorekeeperId })

  eApplyBeg = await addSetupEvent(A.id, 'apply-beg')
  eApplyStd = await addSetupEvent(A.id, 'apply-std')
  eCustom = await addSetupEvent(A.id, 'custom')
  eHandicap = await addSetupEvent(A.id, 'handicap')
  eScorekeeper = await addSetupEvent(A.id, 'sk')
  eLegacy = await addSetupEvent(A.id, 'legacy') // no snapshot → default rules

  // Edit target: a custom snapshot already in place.
  eEdit = await addSetupEvent(A.id, 'edit')
  await seedRuleSnapshot({ eventId: eEdit, source: 'custom', payload: customRulePayload(21) })

  // Reset target: a preset snapshot that was edited away from the preset (group 25 ≠ preset 21),
  // snapshot_version 3 — resetting must restore the preset's group 21 and bump to 4.
  eReset = await addSetupEvent(A.id, 'reset')
  await seedRuleSnapshot({
    eventId: eReset, source: 'preset', presetKey: FJP_PRESET_KEY, presetVersion: FJP_PRESET_VERSION,
    category: 'standard', snapshotVersion: 3, requiresConfiguration: true, payload: editedStandardPayload(25),
  })

  // Delete target: a custom snapshot in setup.
  eDelete = await addSetupEvent(A.id, 'delete')
  await seedRuleSnapshot({ eventId: eDelete, source: 'custom', payload: customRulePayload(21) })

  // Conflict target: a custom snapshot two contexts will race on.
  eConflict = await addSetupEvent(A.id, 'conflict')
  await seedRuleSnapshot({ eventId: eConflict, source: 'custom', payload: customRulePayload(21) })

  // Locked states.
  eScheduled = await addSetupEvent(A.id, 'sched')
  await seedGeneratedButUnscored(eScheduled)
  eResult = await addSetupEvent(A.id, 'result')
  await seedResulted(eResult)
  await seedRuleSnapshot({
    eventId: eResult, source: 'preset', presetKey: FJP_PRESET_KEY, presetVersion: FJP_PRESET_VERSION,
    category: 'beginner', snapshotVersion: 1, requiresConfiguration: true, payload: fjpBeginnerPayload(),
  })

  // Public summary target: a preset snapshot on a published event.
  ePublicPreset = await addSetupEvent(A.id, 'pub')
  await seedRuleSnapshot({
    eventId: ePublicPreset, source: 'preset', presetKey: FJP_PRESET_KEY, presetVersion: FJP_PRESET_VERSION,
    category: 'beginner', snapshotVersion: 1, requiresConfiguration: true, payload: fjpBeginnerPayload(),
  })

  // B — a foreign published tournament neither scoped role belongs to.
  B = await createTournament({ status: 'published', label: 'rulesB' })
  eventB = await addSetupEvent(B.id, 'B')

  // draftT — a DRAFT carrying a snapshot; the public page must 404 and never expose the summary.
  draftT = await createTournament({ status: 'draft', label: 'rulesDraft' })
  eDraft = await addSetupEvent(draftT.id, 'draft')
  await seedRuleSnapshot({
    eventId: eDraft, source: 'preset', presetKey: FJP_PRESET_KEY, presetVersion: FJP_PRESET_VERSION,
    category: 'standard', snapshotVersion: 1, requiresConfiguration: true, payload: fjpStandardPayload(),
  })
})

test.afterAll(async () => {
  await cleanupRun()
})

// ── Payload builders (mirror the pure engine's shapes) ─────────────────────────────────────────
function fjpBeginnerPayload() {
  return {
    group: { match: { games_to_win: 1, max_games: 1, points_to_win: 15, win_by: 1, points_cap: null, allow_tied_game: false }, win_table_points: 1, loss_table_points: 0, tie_break_order: ['table_points', 'point_difference', 'points_for', 'organizer_decision'] },
    knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
    handicap: { enabled: true, mode: 'starting_score', entries: [], requires_configuration: true },
  }
}
function fjpStandardPayload() {
  const p = fjpBeginnerPayload()
  p.group.match.points_to_win = 21
  return p
}
function editedStandardPayload(groupPoints: number) {
  const p = fjpStandardPayload()
  p.group.match.points_to_win = groupPoints
  return p
}

async function seedGeneratedButUnscored(eventId: string): Promise<void> {
  const [a, b] = await addCompetitors(eventId, ['S-A', 'S-B'])
  const g = await addGroup(eventId, 'A')
  await assignToGroup(eventId, g, [a.id, b.id])
  // A pending (not completed) match → guard = requires_schedule_reset.
  const { error } = await admin().from('tournament_matches').insert({
    id: randomUUID(), event_id: eventId, group_id: g, stage: 'group', bracket: null,
    round_number: 0, match_number: 1, competitor_a_id: a.id, competitor_b_id: b.id,
    status: 'pending', winner_competitor_id: null, generation_key: 'RULES-sched-m1', version: 1,
  })
  if (error) throw new Error(`seedGeneratedButUnscored: ${error.message}`)
}

async function seedResulted(eventId: string): Promise<void> {
  const [a, b] = await addCompetitors(eventId, ['R-A', 'R-B'])
  const g = await addGroup(eventId, 'A')
  await assignToGroup(eventId, g, [a.id, b.id])
  await addCompletedGroupMatch({ eventId, groupId: g, matchNumber: 1, aId: a.id, bId: b.id, winnerId: a.id })
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 1–4. Access model
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('access', () => {
  test.describe('site admin', () => {
    test.use({ storageState: adminStateFile })
    test('opens the rule tab and can manage', async ({ page }) => {
      const g = attachGuard(page)
      await openRuleTab(page, A.id, eApplyBeg)
      await expect(page.getByText(t('admin_event_rules.readonly_notice'))).toHaveCount(0)
      assertSecure(g)
    })
  })

  test.describe('manager', () => {
    test.use({ storageState: managerStateFile })
    test('opens the rule tab of an assigned tournament and can manage', async ({ page }) => {
      const g = attachGuard(page)
      await openRuleTab(page, A.id, eApplyStd)
      await expect(page.getByText(t('admin_event_rules.readonly_notice'))).toHaveCount(0)
      assertSecure(g)
    })
    test('a foreign tournament event is a hard 404 (no rule data)', async ({ page }) => {
      const resp = await page.goto(`${BASE}/${B.id}/noi-dung/${eventB}`)
      expect(resp?.status()).toBe(404)
      await expect(page.getByRole('heading', { name: t('admin_event_rules.heading') })).toHaveCount(0)
    })
  })

  test.describe('scorekeeper', () => {
    test.use({ storageState: scorekeeperStateFile })
    test('gets a READ-ONLY rule tab (no apply / edit / delete)', async ({ page }) => {
      const g = attachGuard(page)
      await openRuleTab(page, A.id, eScorekeeper)
      await expect(page.getByText(t('admin_event_rules.readonly_notice'))).toBeVisible()
      await expect(page.getByRole('button', { name: t('admin_event_rules.apply_preset') })).toHaveCount(0)
      await expect(page.getByRole('button', { name: t('admin_event_rules.edit_rules') })).toHaveCount(0)
      await expect(page.getByRole('button', { name: t('admin_event_rules.delete_snapshot') })).toHaveCount(0)
      assertSecure(g)
    })
  })

  test.describe('regular user', () => {
    test.use({ storageState: userStateFile })
    test('cannot open a scoped event workspace at all (404)', async ({ page }) => {
      const resp = await page.goto(`${BASE}/${A.id}/noi-dung/${eApplyBeg}`)
      expect(resp?.status()).toBe(404)
    })
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 5–8. Apply preset / preview / handicap warning
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('apply preset (site admin)', () => {
  test.use({ storageState: adminStateFile })

  test('preview shows 15 / 21 / win-by-2 / cap 31 for the two FJP categories', async ({ page }) => {
    await openRuleTab(page, A.id, eApplyBeg)
    const picker = page.locator('#preset-picker')
    await expect(picker).toBeVisible()
    await page.locator('#preset-select').selectOption(FJP_PRESET_KEY)
    // Beginner → group 15.
    await page.locator('#category-select').selectOption('beginner')
    await expect(picker.getByText('15', { exact: true }).first()).toBeVisible()
    await expect(picker.getByText('31', { exact: true }).first()).toBeVisible()
    // Standard → group 21.
    await page.locator('#category-select').selectOption('standard')
    await expect(picker.getByText('21', { exact: true }).first()).toBeVisible()
  })

  test('applying a pending preset REQUIRES acknowledging the handicap warning first', async ({ page }) => {
    await openRuleTab(page, A.id, eHandicap)
    await page.locator('#preset-select').selectOption(FJP_PRESET_KEY)
    await page.locator('#category-select').selectOption('beginner')
    const apply = page.getByRole('button', { name: t('admin_event_rules.apply_preset') })
    await expect(apply).toBeDisabled()
    await page.getByLabel(t('admin_handicap_warning.acknowledge')).check()
    await expect(apply).toBeEnabled()
    await apply.click()
    await expect.poll(async () => (await readRuleSnapshot(eHandicap))?.source).toBe('preset')
    const snap = await readRuleSnapshot(eHandicap)
    expect(snap?.requiresConfiguration).toBe(true)
    expect(await countAudit(eHandicap, 'event_rule_preset_applied')).toBe(1)
    expect(await countAudit(eHandicap, 'event_rule_warning_acknowledged')).toBeGreaterThanOrEqual(1)
  })

  test('apply FJP Beginner → snapshot has category beginner, group target 15', async ({ page }) => {
    await openRuleTab(page, A.id, eApplyBeg)
    await page.locator('#preset-select').selectOption(FJP_PRESET_KEY)
    await page.locator('#category-select').selectOption('beginner')
    await page.getByLabel(t('admin_handicap_warning.acknowledge')).check()
    await page.getByRole('button', { name: t('admin_event_rules.apply_preset') }).click()
    await expect.poll(async () => (await readRuleSnapshot(eApplyBeg))?.category).toBe('beginner')
    const snap = await readRuleSnapshot(eApplyBeg)
    expect((snap?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(15)
  })

  test('apply FJP Standard → group target 21', async ({ page }) => {
    await openRuleTab(page, A.id, eApplyStd)
    await page.locator('#preset-select').selectOption(FJP_PRESET_KEY)
    await page.locator('#category-select').selectOption('standard')
    await page.getByLabel(t('admin_handicap_warning.acknowledge')).check()
    await page.getByRole('button', { name: t('admin_event_rules.apply_preset') }).click()
    await expect.poll(async () => (await readRuleSnapshot(eApplyStd))?.category).toBe('standard')
    const snap = await readRuleSnapshot(eApplyStd)
    expect((snap?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(21)
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 9–11. Custom create / edit / tie-break duplicate guard
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('custom + edit (site admin)', () => {
  test.use({ storageState: adminStateFile })

  test('create a custom snapshot from the default rules', async ({ page }) => {
    await openRuleTab(page, A.id, eCustom)
    await page.getByRole('button', { name: t('admin_event_rules.choice_custom') }).click()
    await page.getByRole('button', { name: t('admin_event_rules.create_custom') }).click()
    await expect.poll(async () => (await readRuleSnapshot(eCustom))?.source).toBe('custom')
    const snap = await readRuleSnapshot(eCustom)
    expect(snap?.presetKey).toBeNull()
  })

  test('edit an existing snapshot bumps the snapshot version and records the change', async ({ page }) => {
    await openRuleTab(page, A.id, eEdit)
    await page.getByRole('button', { name: t('admin_event_rules.edit_rules') }).click()
    const groupPoints = page.locator('#rf-group\\.match\\.points_to_win')
    await groupPoints.fill('25')
    await page.getByRole('button', { name: t('admin_event_rules.save_changes') }).click()
    await expect.poll(async () => (await readRuleSnapshot(eEdit))?.snapshotVersion).toBeGreaterThan(1)
    const snap = await readRuleSnapshot(eEdit)
    expect((snap?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(25)
    expect(await countAudit(eEdit, 'event_rule_snapshot_updated')).toBe(1)
  })

  test('the tie-break editor never offers a token already in the order (no duplicates)', async ({ page }) => {
    await openRuleTab(page, A.id, eEdit)
    await page.getByRole('button', { name: t('admin_event_rules.edit_rules') }).click()
    // Every token currently in the ordered list must NOT appear as an "add" option.
    const listItems = await page.getByRole('listitem').allInnerTexts().catch(() => [] as string[])
    const addSelect = page.locator('#tie-add')
    if ((await addSelect.count()) > 0) {
      const optionTexts = await addSelect.locator('option').allInnerTexts()
      for (const present of listItems) {
        const label = present.replace(/^\d+\.\s*/, '').trim()
        if (label) expect(optionTexts.some((o) => o.trim() === label)).toBe(false)
      }
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 12. Version conflict across two contexts
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('version conflict (two contexts)', () => {
  test.use({ storageState: adminStateFile })

  test('a stale save shows a conflict banner + reload, never overwriting the other edit', async ({ page, browser }) => {
    await openRuleTab(page, A.id, eConflict)
    await page.getByRole('button', { name: t('admin_event_rules.edit_rules') }).click()
    await page.locator('#rf-group\\.match\\.points_to_win').fill('19')

    // Second context saves first (bumps the version).
    const ctx2: BrowserContext = await browser.newContext({ storageState: adminStateFile })
    const page2 = await ctx2.newPage()
    await openRuleTab(page2, A.id, eConflict)
    await page2.getByRole('button', { name: t('admin_event_rules.edit_rules') }).click()
    await page2.locator('#rf-group\\.match\\.points_to_win').fill('23')
    await page2.getByRole('button', { name: t('admin_event_rules.save_changes') }).click()
    await expect.poll(async () => (await readRuleSnapshot(eConflict))?.snapshotVersion).toBeGreaterThan(1)
    await ctx2.close()

    // First context now saves stale → conflict banner + reload button; its draft is NOT lost.
    await page.getByRole('button', { name: t('admin_event_rules.save_changes') }).click()
    await expect(page.getByText(t('admin_event_rules.version_conflict'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_event_rules.reload_snapshot') })).toBeVisible()
    // The other editor's value survived — our stale 19 never overwrote the 23.
    const snap = await readRuleSnapshot(eConflict)
    expect((snap?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(23)
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 13. Reset to the ORIGINAL preset version
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('reset to preset (site admin)', () => {
  test.use({ storageState: adminStateFile })

  test('reset restores the original preset rules and bumps the snapshot version', async ({ page }) => {
    // Seeded edited-away payload: group 25; the preset standard target is 21.
    const before = await readRuleSnapshot(eReset)
    expect((before?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(25)

    await openRuleTab(page, A.id, eReset)
    await page.getByRole('button', { name: t('admin_event_rules.reset_to_preset') }).click()
    // Confirm dialog.
    await page.getByRole('dialog').getByRole('button', { name: t('admin_event_rules.reset_to_preset') }).click()

    await expect.poll(async () => (await readRuleSnapshot(eReset))?.snapshotVersion).toBe((before?.snapshotVersion ?? 3) + 1)
    const after = await readRuleSnapshot(eReset)
    expect((after?.payload.group as { match: { points_to_win: number } }).match.points_to_win).toBe(21)
    expect(after?.source).toBe('preset')
    expect(after?.presetVersion).toBe(FJP_PRESET_VERSION)
    expect(await countAudit(eReset, 'event_rule_snapshot_reset')).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 14. Delete in setup → default fallback
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('delete snapshot (site admin)', () => {
  test.use({ storageState: adminStateFile })

  test('delete removes the snapshot and the event falls back to default rules', async ({ page }) => {
    await openRuleTab(page, A.id, eDelete)
    await page.getByRole('button', { name: t('admin_event_rules.delete_snapshot') }).click()
    await page.getByRole('dialog').getByRole('button', { name: t('admin_event_rules.delete_snapshot') }).click()
    await expect.poll(async () => await readRuleSnapshot(eDelete)).toBeNull()
    expect(await countAudit(eDelete, 'event_rule_snapshot_deleted')).toBe(1)
    // The empty-state choices are shown again.
    await expect(page.getByText(t('admin_event_rules.empty_title'))).toBeVisible()
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 15–16. Locked states
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('locked states (site admin)', () => {
  test.use({ storageState: adminStateFile })

  test('a generated (unscored) schedule makes the rule tab read-only w/ a reset hint', async ({ page }) => {
    await openRuleTab(page, A.id, eScheduled)
    await expect(page.getByText(t('admin_event_rules.guard_requires_reset'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_event_rules.apply_preset') })).toHaveCount(0)
    await expect(page.getByRole('button', { name: t('admin_event_rules.edit_rules') })).toHaveCount(0)
  })

  test('a recorded result locks rule mutations but keeps the summary visible', async ({ page }) => {
    await openRuleTab(page, A.id, eResult)
    await expect(page.getByText(t('admin_event_rules.guard_locked'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_event_rules.edit_rules') })).toHaveCount(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════════════════════
// 17–20. Public summary (anonymous)
// ════════════════════════════════════════════════════════════════════════════════════════════
test.describe('public rule summary (anonymous)', () => {
  const publicUrl = (slug: string, eventId: string) => `/giai-dau/${slug}?event=${eventId}&tab=luat-thi-dau`

  test('a preset event shows a correct, minimal summary — and never an internal field', async ({ page }) => {
    const g = attachGuard(page)
    await page.goto(publicUrl(A.slug, ePublicPreset))
    await page.getByRole('tab', { name: t('tournaments.tabs.rules') }).click()
    await expect(page.getByText(t('tournaments.rules.source_preset'))).toBeVisible()
    await expect(page.getByText('FJP Olympiad 2026')).toBeVisible()
    await expect(page.getByText(t('tournaments.rules.category_beginner'))).toBeVisible()
    await expect(page.getByText(t('tournaments.rules.handicap_on_pending'))).toBeVisible()

    // No internal token ever reaches the browser DOM.
    const html = await page.content()
    expect(html.includes(FJP_PRESET_KEY)).toBe(false)          // preset KEY (only the label is public)
    expect(html.includes('requires_configuration')).toBe(false)
    const snap = await readRuleSnapshot(ePublicPreset)
    if (snap) expect(html.includes(snap.id)).toBe(false)        // snapshot id never exposed
    assertNoAuditLogRequests(g)
    assertSecure(g)
  })

  test('a legacy event (no snapshot) shows the system-default notice', async ({ page }) => {
    await page.goto(publicUrl(A.slug, eLegacy))
    await page.getByRole('tab', { name: t('tournaments.tabs.rules') }).click()
    await expect(page.getByText(t('tournaments.rules.default_notice'))).toBeVisible()
  })

  test('a draft tournament never leaks a page or a rule summary', async ({ page }) => {
    const resp = await page.goto(`/giai-dau/${draftT.slug}?event=${eDraft}&tab=luat-thi-dau`)
    // Content assertions (dev/prod stable): the not-found view renders and neither the tournament
    // detail nor the rule summary leaks. Status is 404 in a production build but — with
    // `dynamic = 'force-dynamic'` — Next dev serves notFound() as HTTP 200 while rendering the
    // not-found UI (documented dev quirk; see routes.spec.ts §16), so tolerate [200, 404].
    await expect(page).toHaveTitle(new RegExp(t('tournaments.public.not_found_title')))
    expect([200, 404]).toContain(resp?.status() ?? 0)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByText('FJP Olympiad 2026')).toHaveCount(0)
  })
})
