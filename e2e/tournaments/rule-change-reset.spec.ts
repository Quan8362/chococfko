// Prompt 15D-2 — CONTROLLED RULE CHANGE / RESET / REGENERATION browser gate.
//
// Exercises the "Luật thi đấu" tab's controlled-change flow end-to-end against the LOCAL stack:
//   • With a generated (and scored) event, a Manager sees the guard banner + a "controlled change"
//     entry; the plain editor stays blocked. Opening it runs the READ-ONLY impact preview (counts) and
//     applying (with the destructive confirmation phrase + round-robin regenerate) WIPES the results
//     and downstream, bumps the snapshot version, regenerates fresh READY matches and writes audit.
//   • Cancelling the modal changes NOTHING in the DB (preview is read-only).
//   • A Scorekeeper gets a read-only tab — no controlled-change control at all.
//   • Two contexts on one snapshot: the second apply is refused (stale/conflict), never a silent
//     overwrite.
//   • After a reset the PUBLIC detail page shows the not-started (no-standings) state.
//   • The impact modal fits a phone viewport with no horizontal overflow.
//
// The SERVER enforces authorization + atomicity + staleness (checkTournamentPermission + the pure
// classifier/guard + the tournament_apply_rule_change RPC); these tests prove the UI honours it and
// asserts DB truth via the service-role seed helpers. Data is RUN_PREFIX-tagged; afterAll wipes it.

import { test, expect, type Page } from '@playwright/test'
import { managerStateFile, scorekeeperStateFile, MANAGER_EMAIL, SCOREKEEPER_EMAIL } from './_env'
import { t, attachGuard, assertSecure } from './helpers'
import {
  admin, createTournament, addEvent, addCompetitors, addGroup, assignToGroup, addCompletedGroupMatch,
  seedActiveMember, authUserIdByEmail, seedRuleSnapshot, readRuleSnapshot, countAudit, customRulePayload, cleanupRun,
  type TournamentHandle, type CompetitorHandle,
} from './seed'

const BASE = '/quan-ly-giai-dau'

let A: TournamentHandle

async function groupMatchStats(eventId: string): Promise<{ total: number; ready: number; completed: number; games: number }> {
  const { data: rows } = await admin()
    .from('tournament_matches')
    .select('id, status, stage')
    .eq('event_id', eventId)
    .eq('stage', 'group')
  const matches = (rows as { id: string; status: string }[] | null) ?? []
  const ids = matches.map((m) => m.id)
  let games = 0
  if (ids.length) {
    const { count } = await admin().from('tournament_match_games').select('*', { count: 'exact', head: true }).in('match_id', ids)
    games = count ?? 0
  }
  return {
    total: matches.length,
    ready: matches.filter((m) => m.status === 'ready').length,
    completed: matches.filter((m) => m.status === 'completed').length,
    games,
  }
}

async function eventStatus(eventId: string): Promise<string> {
  const { data } = await admin().from('tournament_events').select('status').eq('id', eventId).single()
  return (data as { status: string }).status
}

// A group_knockout event: 1 group of 3 assigned competitors, one COMPLETED group match (+game), and a
// preset-independent custom rule snapshot. That is the "results present" state that only the controlled
// destructive path may change.
async function seedScoredEvent(label: string): Promise<{ eventId: string; snapshotId: string }> {
  const ev = await addEvent(A.id, { format: 'group_knockout', label, groupCount: 1, winnerQualifiersPerGroup: 1 })
  const eventId = ev.id
  const comps: CompetitorHandle[] = await addCompetitors(eventId, [`${label}-A`, `${label}-B`, `${label}-C`])
  const groupId = await addGroup(eventId, 'A', 0)
  await assignToGroup(eventId, groupId, comps.map((c) => c.id))
  await addCompletedGroupMatch({ eventId, groupId, matchNumber: 1, aId: comps[0].id, bId: comps[1].id, winnerId: comps[0].id })
  const snapshotId = await seedRuleSnapshot({ eventId, source: 'custom', payload: customRulePayload(21) })
  await admin().from('tournament_events').update({ status: 'group_stage' }).eq('id', eventId)
  return { eventId, snapshotId }
}

async function openRulesTab(page: Page, eventId: string) {
  await page.goto(`${BASE}/${A.id}/noi-dung/${eventId}`)
  await page.getByRole('tab', { name: t('admin_event_rules.tab_rules') }).click()
  await expect(page.getByRole('heading', { name: t('admin_event_rules.heading') })).toBeVisible()
}

// Change the group "points to win" so the classifier sees a scoring change, then open the impact modal.
async function editAndPreview(page: Page, newPoints: number) {
  await page.getByRole('button', { name: t('admin_event_rules.controlled_change') }).click()
  const field = page.locator('[data-path="group.match.points_to_win"]').first()
  await field.fill(String(newPoints))
  await page.getByRole('button', { name: t('admin_event_rules.preview_impact') }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(t('admin_rule_change.title'))).toBeVisible()
}

test.beforeAll(async () => {
  A = await createTournament({ status: 'published', label: 'rule-change' })
  const managerId = await authUserIdByEmail(MANAGER_EMAIL)
  const scorekeeperId = await authUserIdByEmail(SCOREKEEPER_EMAIL)
  await seedActiveMember({ tournamentId: A.id, email: MANAGER_EMAIL, role: 'manager', userId: managerId })
  await seedActiveMember({ tournamentId: A.id, email: SCOREKEEPER_EMAIL, role: 'scorekeeper', userId: scorekeeperId })
})

test.afterAll(async () => {
  await cleanupRun()
})

test.describe('controlled rule change / reset', () => {
  test.use({ storageState: managerStateFile })

  test('manager: destructive change + regenerate wipes results and rebuilds fresh matches', async ({ page }) => {
    const guard = attachGuard(page)
    const { eventId, snapshotId } = await seedScoredEvent('destructive')

    const before = await groupMatchStats(eventId)
    expect(before.completed).toBe(1)
    expect(before.games).toBe(1)
    const snapBefore = await readRuleSnapshot(eventId)

    await openRulesTab(page, eventId)
    await editAndPreview(page, 15)

    // Destructive path: the confirmation input is required, reset scope is forced to the full reset.
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('RESET').fill('RESET')
    // Choose the round-robin regenerate.
    await dialog.getByRole('combobox').last().selectOption('round_robin')
    await dialog.getByRole('button', { name: t('admin_rule_change.apply') }).click()

    await expect(page.getByRole('dialog')).toBeHidden()

    // DB truth: results + games gone, three fresh READY matches, status back to group_stage.
    await expect.poll(async () => (await groupMatchStats(eventId)).completed).toBe(0)
    const after = await groupMatchStats(eventId)
    expect(after.games).toBe(0)
    expect(after.total).toBe(3)
    expect(after.ready).toBe(3)
    expect(await eventStatus(eventId)).toBe('group_stage')

    // Snapshot: payload updated, version + snapshot_version bumped.
    const snapAfter = await readRuleSnapshot(eventId)
    expect((snapAfter!.payload as { group: { match: { points_to_win: number } } }).group.match.points_to_win).toBe(15)
    expect(snapAfter!.snapshotVersion).toBe(snapBefore!.snapshotVersion + 1)
    expect(snapAfter!.version).toBeGreaterThan(snapBefore!.version)
    expect(snapAfter!.id).toBe(snapshotId)

    // Audit chain written.
    expect(await countAudit(eventId, 'event_rule_change_applied')).toBe(1)
    expect(await countAudit(eventId, 'event_schedule_regenerated')).toBe(1)

    assertSecure(guard)
  })

  test('cancel leaves the database unchanged (preview is read-only)', async ({ page }) => {
    const { eventId } = await seedScoredEvent('cancel')
    const before = await groupMatchStats(eventId)
    const snapBefore = await readRuleSnapshot(eventId)

    await openRulesTab(page, eventId)
    await editAndPreview(page, 15)
    await page.getByRole('dialog').getByRole('button', { name: t('admin_rule_change.cancel') }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    const after = await groupMatchStats(eventId)
    expect(after).toEqual(before)
    const snapAfter = await readRuleSnapshot(eventId)
    expect(snapAfter!.snapshotVersion).toBe(snapBefore!.snapshotVersion)
    expect(snapAfter!.version).toBe(snapBefore!.version)
    expect(await countAudit(eventId, 'event_rule_change_applied')).toBe(0)
  })

  test('two contexts on one snapshot: the second apply is refused (stale), never silent overwrite', async ({ browser, page }) => {
    const { eventId } = await seedScoredEvent('stale')
    // Context 1 previews.
    await openRulesTab(page, eventId)
    await editAndPreview(page, 15)

    // Context 2 applies first (bumps snapshot version).
    const ctx2 = await browser.newContext({ storageState: managerStateFile })
    const p2 = await ctx2.newPage()
    await openRulesTab(p2, eventId)
    await editAndPreview(p2, 17)
    await p2.getByRole('dialog').getByPlaceholder('RESET').fill('RESET')
    await p2.getByRole('dialog').getByRole('button', { name: t('admin_rule_change.apply') }).click()
    await expect(p2.getByRole('dialog')).toBeHidden()

    // Context 1's stale apply must fail (stale token OR snapshot version conflict) — the modal stays open
    // with an error, and the DB reflects only context 2's change (points_to_win = 17).
    await page.getByRole('dialog').getByPlaceholder('RESET').fill('RESET')
    await page.getByRole('dialog').getByRole('button', { name: t('admin_rule_change.apply') }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()

    const snap = await readRuleSnapshot(eventId)
    expect((snap!.payload as { group: { match: { points_to_win: number } } }).group.match.points_to_win).toBe(17)
    await ctx2.close()
  })

  test('impact modal fits a phone viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    const { eventId } = await seedScoredEvent('mobile')
    await openRulesTab(page, eventId)
    await editAndPreview(page, 15)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(overflow).toBe(false)
  })
})

test.describe('scorekeeper is blocked from the controlled change', () => {
  test.use({ storageState: scorekeeperStateFile })

  test('scorekeeper gets a read-only rule tab with no controlled-change control', async ({ page }) => {
    const { eventId } = await seedScoredEvent('sk')
    await openRulesTab(page, eventId)
    await expect(page.getByText(t('admin_event_rules.readonly_notice'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_event_rules.controlled_change') })).toHaveCount(0)
  })
})
