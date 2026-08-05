'use server'

// Admin CRUD for tournament EVENTS (nội dung thi đấu) and their COMPETITORS. Same discipline as
// the tournament-entity actions (app/admin/giai-dau/actions.ts). EVERY mutation follows:
//   1. authenticate → may(tournamentId, <permission>)  (Site Admin OR scoped role → allowed)
//   2. validate input with the shared pure validators
//   3. verify the parent tournament exists AND the event/competitor belongs to it (anti-IDOR):
//      never trust tournamentId / eventId / competitorId / status / version from the client
//   4. check optimistic-concurrency token (tournament_events.version — bumped by trigger;
//      tournament_competitors.updated_at — bumped by trigger)
//   5. mutate via the SERVICE-ROLE client
//   6. write an audit-log entry (actor, event, changed fields — NEVER tokens/cookies/secrets)
//   7. revalidate the affected routes and return a TYPED result (no raw SQL error to the UI)

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkTournamentPermission } from '@/lib/tournaments/permissions/server'
import type { TournamentPermission } from '@/lib/tournaments/permissions'
import { validateEventInput } from '@/lib/tournaments/eventValidation'
import type { EventFormValues } from '@/lib/tournaments/eventValidation'
import {
  validateCompetitorInput,
  parseBulkCompetitors,
  competitorNameKey,
} from '@/lib/tournaments/competitorValidation'
import type { CompetitorFormValues } from '@/lib/tournaments/competitorValidation'
import type {
  BulkMutationResult,
  CompetitorMutationResult,
  EventMutationResult,
  GroupMutationError,
  GroupMutationResult,
} from '@/lib/tournaments/admin/types'
import {
  groupLetters,
  validateAssignmentPayload,
  evaluateReadiness,
  type AssignmentPayload,
  type GroupStageFormat,
} from '@/lib/tournaments/domain/group-assignment'
import { buildRoundRobinMatches } from '@/lib/tournaments/domain/group-preview'
import { type ScoreGameInput } from '@/lib/tournaments/domain/score-input'
import { resolveMatchScore, getEventGroupTablePoints, type ResolvedMatchScore } from '@/lib/tournaments/admin/scoringRuntime'
import type { TablePointsConfig } from '@/lib/tournaments/domain/standings'
import { resolveTieOrder } from '@/lib/tournaments/domain/tie-resolution'
import {
  evaluateGroupStage,
  type EventProgressStatus,
  type GroupEvaluationInput,
} from '@/lib/tournaments/domain/event-progress'
import { calculateStandings } from '@/lib/tournaments/domain/standings'
import type { Competitor, MatchInput } from '@/lib/tournaments/domain/types'
import type { ScoreMutationError, ScoreMutationResult } from '@/lib/tournaments/admin/types'
import {
  validateSeedPayload,
  evaluateSeedReadiness,
  buildKnockoutBracketFromSeeds,
  buildKnockoutMatchRows,
  reconstructBracketForProgression,
  type SeedPayload,
  type DbKnockoutMatch,
} from '@/lib/tournaments/domain/knockout-seed'
import {
  buildGroupRankTokens,
  validateBranchSeedPayload,
  evaluateBranchSeedReadiness,
  resolveBranchSeeds,
  parseGroupRankTokenId,
} from '@/lib/tournaments/domain/group-knockout-seed'
import type { QualificationOutcome } from '@/lib/tournaments/domain/qualification'
import type { Bracket } from '@/lib/tournaments/domain/types'
import { progressKnockout } from '@/lib/tournaments/domain/progression'
import { calculatePodium, type PodiumInput } from '@/lib/tournaments/domain/podium'
import { analyzeKnockoutCorrection, type ImpactMatchRecord } from '@/lib/tournaments/domain/knockout-impact'
import type { KnockoutMutationError, KnockoutMutationResult } from '@/lib/tournaments/admin/types'
import type {
  EventStatus,
  ImpactAffectedMatchView,
  ImpactPreviewResult,
  KnockoutImpactPreview,
  ResetPathResult,
} from '@/lib/tournaments/admin/types'

import {
  buildRuleSetFromEditorFields,
  createEventRuleSnapshot,
  validateEventRuleSnapshot,
  classifyRuleChange,
  deriveRuleChangeGuard,
  summarizeRuleChangeImpact,
  computeRuleChangeImpactToken,
  applicableRegenerateModes,
  RULE_CHANGE_CONFIRM_PHRASE,
  type RuleSet,
  type RuleChangeImpactInput,
  type RuleChangePreviewResult,
  type RuleChangeApplyResult,
  type RuleChangeApplyInput,
} from '@/lib/tournaments/rules'

const PG_FK_VIOLATION = '23503'

// Build the RPC games payload from a resolved score. Carries the SERVER-COMPUTED handicap starting
// score (§12) — never a client value — plus the handicap mode/version so an old result stays auditable
// even after a preset is edited. starting_score_* default to 0 for non-handicap events. The RPCs read
// these keys with COALESCE, so older RPCs (pre-migration-10) ignore them harmlessly.
function toGamesPayload(scored: ResolvedMatchScore) {
  return scored.games.map((g) => ({
    game_number: g.gameNumber,
    score_a: g.scoreA,
    score_b: g.scoreB,
    starting_score_a: g.startingScoreA,
    starting_score_b: g.startingScoreB,
    handicap_mode: scored.handicapMode,
    handicap_version: scored.handicapVersion,
  }))
}

function revalidateEventViews(tournamentId: string, eventId?: string) {
  // Both the legacy Site-Admin mount and the scoped management surface render these views.
  for (const base of ['/admin/giai-dau', '/quan-ly-giai-dau']) {
    revalidatePath(`${base}/${tournamentId}`)
    if (eventId) {
      revalidatePath(`${base}/${tournamentId}/noi-dung/${eventId}`)
      revalidatePath(`${base}/${tournamentId}/noi-dung/${eventId}/edit`)
    }
  }
}

// Scoped guard for an event/competitor/group/bracket/score/tie mutation. Replaces the old blanket
// checkIsAdmin(): a Site Admin still passes everything, while a scoped manager/scorekeeper passes
// ONLY the permissions their role maps to. The service-role client is created only after this
// returns true. Every mutation names the CONCRETE capability (see the role→permission table).
async function may(tournamentId: string, permission: TournamentPermission): Promise<boolean> {
  const check = await checkTournamentPermission(tournamentId, permission)
  return check.ok
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

// Best-effort audit write — never lets an audit failure roll back the primary mutation. Metadata
// is limited to actor / ids / changed fields — NEVER tokens, cookies, sessions or secrets.
async function writeAudit(
  admin: SupabaseClient,
  entry: {
    tournamentId: string | null
    eventId: string | null
    actorId: string | null
    action: string
    detail: Record<string, unknown>
  },
): Promise<void> {
  try {
    await admin.from('tournament_audit_log').insert({
      tournament_id: entry.tournamentId,
      event_id: entry.eventId,
      actor_id: entry.actorId,
      action: entry.action,
      detail: entry.detail,
    })
  } catch {
    /* audit is best-effort */
  }
}

interface EventContext {
  id: string
  tournamentId: string
  name: string
  format: string
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
  version: number
  matchCount: number
  completedMatchCount: number
}

// Load an event, PROVING it belongs to `tournamentId`, plus its match counts. Returns null when
// the event is missing or attached to a different tournament (anti-IDOR).
async function loadEvent(
  admin: SupabaseClient,
  tournamentId: string,
  eventId: string,
): Promise<EventContext | null> {
  const { data: row } = await admin
    .from('tournament_events')
    .select(
      'id, tournament_id, name, format, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, third_place_enabled, version',
    )
    .eq('id', eventId)
    .maybeSingle()
  const data = row as unknown as {
    id: string
    tournament_id: string
    name: string
    format: string
    group_count: number
    winner_qualifiers_per_group: number
    consolation_qualifiers_per_group: number
    third_place_enabled: boolean
    version: number
  } | null
  if (!data || data.tournament_id !== tournamentId) return null

  const [{ count: matchCount }, { count: completedCount }] = await Promise.all([
    admin.from('tournament_matches').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'completed'),
  ])

  return {
    id: data.id,
    tournamentId: data.tournament_id,
    name: data.name,
    format: data.format,
    groupCount: data.group_count,
    winnerQualifiersPerGroup: data.winner_qualifiers_per_group,
    consolationQualifiersPerGroup: data.consolation_qualifiers_per_group,
    thirdPlaceEnabled: data.third_place_enabled,
    version: data.version,
    matchCount: matchCount ?? 0,
    completedMatchCount: completedCount ?? 0,
  }
}

async function tournamentExists(admin: SupabaseClient, tournamentId: string): Promise<boolean> {
  const { data } = await admin.from('tournaments').select('id').eq('id', tournamentId).maybeSingle()
  return !!data
}

// Whether the KNOCKOUT bracket has been generated for an event. For group_knockout, the group-stage
// matches (stage='group') always exist once the groups are played, so `ev.matchCount > 0` is NOT a
// valid "bracket already created" signal there — seeding happens precisely AFTER the group stage.
// The bracket-existence probe (mirroring getGroupKnockoutSeedSetupForAdmin) is stage='knockout' only.
async function hasKnockoutMatches(admin: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await admin
    .from('tournament_matches')
    .select('id')
    .eq('event_id', eventId)
    .eq('stage', 'knockout')
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function nextDisplayOrder(
  admin: SupabaseClient,
  table: 'tournament_events' | 'tournament_competitors',
  key: 'tournament_id' | 'event_id',
  parentId: string,
): Promise<number> {
  const { data } = await admin
    .from(table)
    .select('display_order')
    .eq(key, parentId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.display_order ?? -1) + 1
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// EVENT ACTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════

export async function createTournamentEvent(
  tournamentId: string,
  values: EventFormValues,
): Promise<EventMutationResult> {
  if (!(await may(tournamentId, 'event.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId) return { ok: false, error: 'invalid' }

  const parsed = validateEventInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  if (!(await tournamentExists(admin, tournamentId))) return { ok: false, error: 'tournament_not_found' }

  const displayOrder = await nextDisplayOrder(admin, 'tournament_events', 'tournament_id', tournamentId)
  const v = parsed.value
  const { data, error } = await admin
    .from('tournament_events')
    .insert({
      tournament_id: tournamentId,
      name: v.name,
      format: v.format,
      group_count: v.groupCount,
      winner_qualifiers_per_group: v.winnerQualifiersPerGroup,
      consolation_qualifiers_per_group: v.consolationQualifiersPerGroup,
      third_place_enabled: v.thirdPlaceEnabled,
      status: 'setup', // ALWAYS setup on create — never accept a client-chosen status.
      display_order: displayOrder,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'unknown' }

  await writeAudit(admin, {
    tournamentId,
    eventId: data.id,
    actorId,
    action: 'event_created',
    detail: { name: v.name, format: v.format, status_after: 'setup' },
  })
  revalidateEventViews(tournamentId, data.id)
  return { ok: true, id: data.id }
}

export async function updateTournamentEvent(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  values: EventFormValues,
): Promise<EventMutationResult> {
  if (!(await may(tournamentId, 'event.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const parsed = validateEventInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.version !== expectedVersion) return { ok: false, error: 'version_conflict' }

  const v = parsed.value
  const formatChanged = v.format !== ev.format
  const structuralChanged =
    formatChanged ||
    v.groupCount !== ev.groupCount ||
    v.winnerQualifiersPerGroup !== ev.winnerQualifiersPerGroup ||
    v.consolationQualifiersPerGroup !== ev.consolationQualifiersPerGroup ||
    v.thirdPlaceEnabled !== ev.thirdPlaceEnabled

  // Format / structural settings drive match generation. Once matches exist we must NOT silently
  // change them: a completed match locks it hard; a not-yet-played match requires a (later-phase)
  // generation reset first. The name alone is always editable.
  if (structuralChanged && ev.matchCount > 0) {
    return { ok: false, error: ev.completedMatchCount > 0 ? 'event_has_results' : 'event_needs_reset' }
  }

  // Guard on (id, version): a concurrent Admin who saved first bumped version → 0 rows here.
  const { data: updated, error } = await admin
    .from('tournament_events')
    .update({
      name: v.name,
      format: v.format,
      group_count: v.groupCount,
      winner_qualifiers_per_group: v.winnerQualifiersPerGroup,
      consolation_qualifiers_per_group: v.consolationQualifiersPerGroup,
      third_place_enabled: v.thirdPlaceEnabled,
    })
    .eq('id', eventId)
    .eq('tournament_id', tournamentId)
    .eq('version', expectedVersion)
    .select('id')

  if (error) return { ok: false, error: 'unknown' }
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  const changed = (
    [
      ['name', ev.name, v.name],
      ['format', ev.format, v.format],
      ['group_count', ev.groupCount, v.groupCount],
      ['winner_qualifiers_per_group', ev.winnerQualifiersPerGroup, v.winnerQualifiersPerGroup],
      ['consolation_qualifiers_per_group', ev.consolationQualifiersPerGroup, v.consolationQualifiersPerGroup],
      ['third_place_enabled', ev.thirdPlaceEnabled, v.thirdPlaceEnabled],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field)

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'event_updated',
    detail: { changed },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, id: eventId }
}

export async function deleteTournamentEvent(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<EventMutationResult> {
  if (!(await may(tournamentId, 'event.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.version !== expectedVersion) return { ok: false, error: 'version_conflict' }

  // A completed match blocks deletion outright; any generated match requires a reset first.
  if (ev.completedMatchCount > 0) return { ok: false, error: 'event_has_results' }
  if (ev.matchCount > 0) return { ok: false, error: 'event_needs_reset' }

  // Audit BEFORE deleting with event_id NULL: the audit event_id FK is ON DELETE SET NULL, so keep
  // the id inside `detail`. tournament_id stays valid (the tournament itself is not deleted).
  await writeAudit(admin, {
    tournamentId,
    eventId: null,
    actorId,
    action: 'event_deleted',
    detail: { event_id: eventId, name: ev.name, format: ev.format },
  })

  const { data: deleted, error } = await admin
    .from('tournament_events')
    .delete()
    .eq('id', eventId)
    .eq('tournament_id', tournamentId)
    .eq('version', expectedVersion)
    .select('id')

  if (error) return { ok: false, error: 'unknown' }
  if (!deleted || deleted.length === 0) return { ok: false, error: 'version_conflict' }

  revalidateEventViews(tournamentId)
  return { ok: true, id: eventId }
}

export async function reorderTournamentEvents(
  tournamentId: string,
  orderedIds: string[],
): Promise<EventMutationResult> {
  if (!(await may(tournamentId, 'event.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  // Verify the payload is exactly a permutation of THIS tournament's events (anti-IDOR: cannot
  // sneak an id from another tournament, and cannot drop/add rows).
  const { data: rows } = await admin
    .from('tournament_events')
    .select('id')
    .eq('tournament_id', tournamentId)
  const existing = new Set((rows ?? []).map((r) => r.id as string))
  if (existing.size !== orderedIds.length) return { ok: false, error: 'invalid' }
  for (const id of orderedIds) if (!existing.has(id)) return { ok: false, error: 'wrong_tournament' }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('tournament_events')
      .update({ display_order: i })
      .eq('id', orderedIds[i])
      .eq('tournament_id', tournamentId)
    if (error) return { ok: false, error: 'unknown' }
  }

  await writeAudit(admin, {
    tournamentId,
    eventId: null,
    actorId,
    action: 'events_reordered',
    detail: { count: orderedIds.length },
  })
  revalidateEventViews(tournamentId)
  return { ok: true, id: tournamentId }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// COMPETITOR ACTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════

// Fetch existing competitor names for an event as a lower-cased key → id map, for duplicate guards.
async function existingNameKeys(
  admin: SupabaseClient,
  eventId: string,
): Promise<Map<string, string>> {
  const { data } = await admin
    .from('tournament_competitors')
    .select('id, name')
    .eq('event_id', eventId)
  const map = new Map<string, string>()
  for (const r of data ?? []) map.set(competitorNameKey(r.name as string), r.id as string)
  return map
}

export async function createCompetitor(
  tournamentId: string,
  eventId: string,
  values: CompetitorFormValues,
): Promise<CompetitorMutationResult> {
  if (!(await may(tournamentId, 'competitor.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId) return { ok: false, error: 'invalid' }

  const parsed = validateCompetitorInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  // Roster is frozen once matches are generated (would desync brackets); reset needed first.
  if (ev.matchCount > 0) return { ok: false, error: 'event_locked' }

  const keys = await existingNameKeys(admin, eventId)
  if (keys.has(competitorNameKey(parsed.value.name))) {
    return { ok: false, error: 'invalid', fieldErrors: { name: 'name_duplicate' } }
  }

  const displayOrder = await nextDisplayOrder(admin, 'tournament_competitors', 'event_id', eventId)
  const comp = parsed.value.composition
  const { data, error } = await admin
    .from('tournament_competitors')
    .insert({
      event_id: eventId,
      name: parsed.value.name,
      short_name: parsed.value.shortName,
      seed: parsed.value.seed,
      display_order: displayOrder,
      // Gender composition for the handicap layer (Prompt 15D-1B). Null when unset — the whole set
      // is null-or-all (DB CHECK tc_composition_complete).
      competitor_kind: comp ? comp.kind : null,
      male_count: comp ? comp.maleCount : null,
      female_count: comp ? comp.femaleCount : null,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'unknown' }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'competitor_created',
    detail: { competitor_id: data.id, name: parsed.value.name },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, id: data.id }
}

export async function updateCompetitor(
  tournamentId: string,
  eventId: string,
  competitorId: string,
  expectedUpdatedAt: string,
  values: CompetitorFormValues,
): Promise<CompetitorMutationResult> {
  if (!(await may(tournamentId, 'competitor.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !competitorId || !expectedUpdatedAt) {
    return { ok: false, error: 'invalid' }
  }

  const parsed = validateCompetitorInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }

  const actorId = await currentUserId()
  const admin = createAdminClient()

  // Verify the event belongs to the tournament, then the competitor belongs to the event.
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }

  const { data: existing } = await admin
    .from('tournament_competitors')
    .select('id, event_id, name, short_name, seed, updated_at')
    .eq('id', competitorId)
    .maybeSingle()
  if (!existing || existing.event_id !== eventId) return { ok: false, error: 'not_found' }
  if (existing.updated_at !== expectedUpdatedAt) return { ok: false, error: 'version_conflict' }

  const keys = await existingNameKeys(admin, eventId)
  const collidingId = keys.get(competitorNameKey(parsed.value.name))
  if (collidingId && collidingId !== competitorId) {
    return { ok: false, error: 'invalid', fieldErrors: { name: 'name_duplicate' } }
  }

  const comp = parsed.value.composition
  const { data: updated, error } = await admin
    .from('tournament_competitors')
    .update({
      name: parsed.value.name,
      short_name: parsed.value.shortName,
      seed: parsed.value.seed,
      competitor_kind: comp ? comp.kind : null,
      male_count: comp ? comp.maleCount : null,
      female_count: comp ? comp.femaleCount : null,
    })
    .eq('id', competitorId)
    .eq('event_id', eventId)
    .eq('updated_at', expectedUpdatedAt)
    .select('id')

  if (error) return { ok: false, error: 'unknown' }
  if (!updated || updated.length === 0) return { ok: false, error: 'version_conflict' }

  const changed = (
    [
      ['name', existing.name, parsed.value.name],
      ['short_name', existing.short_name, parsed.value.shortName],
      ['seed', existing.seed, parsed.value.seed],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field)

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'competitor_updated',
    detail: { competitor_id: competitorId, changed },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, id: competitorId }
}

export async function deleteCompetitor(
  tournamentId: string,
  eventId: string,
  competitorId: string,
): Promise<CompetitorMutationResult> {
  if (!(await may(tournamentId, 'competitor.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !competitorId) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }

  const { data: existing } = await admin
    .from('tournament_competitors')
    .select('id, event_id, name')
    .eq('id', competitorId)
    .maybeSingle()
  if (!existing || existing.event_id !== eventId) return { ok: false, error: 'not_found' }

  // Cannot delete a competitor that appears in a match: a completed match blocks outright; a
  // pending/ready/bye match (or a group placement) requires a generation reset in a later phase.
  const filter = `competitor_a_id.eq.${competitorId},competitor_b_id.eq.${competitorId},winner_competitor_id.eq.${competitorId}`
  const [{ count: completedRef }, { count: anyRef }, { count: groupRef }] = await Promise.all([
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'completed')
      .or(filter),
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .or(filter),
    admin
      .from('tournament_group_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('competitor_id', competitorId),
  ])
  if ((completedRef ?? 0) > 0) return { ok: false, error: 'competitor_has_results' }
  if ((anyRef ?? 0) > 0 || (groupRef ?? 0) > 0) return { ok: false, error: 'competitor_needs_reset' }

  const { data: deleted, error } = await admin
    .from('tournament_competitors')
    .delete()
    .eq('id', competitorId)
    .eq('event_id', eventId)
    .select('id')

  // DB backstop: tournament_matches → competitor FK is ON DELETE NO ACTION, so a missed app check
  // still fails safely as a FK violation rather than dangling a reference.
  if (error) {
    if (error.code === PG_FK_VIOLATION) return { ok: false, error: 'competitor_needs_reset' }
    return { ok: false, error: 'unknown' }
  }
  if (!deleted || deleted.length === 0) return { ok: false, error: 'not_found' }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'competitor_deleted',
    detail: { competitor_id: competitorId, name: existing.name },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, id: competitorId }
}

export async function reorderCompetitors(
  tournamentId: string,
  eventId: string,
  orderedIds: string[],
): Promise<CompetitorMutationResult> {
  if (!(await may(tournamentId, 'competitor.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.matchCount > 0) return { ok: false, error: 'event_locked' }

  const { data: rows } = await admin
    .from('tournament_competitors')
    .select('id')
    .eq('event_id', eventId)
  const existing = new Set((rows ?? []).map((r) => r.id as string))
  if (existing.size !== orderedIds.length) return { ok: false, error: 'invalid' }
  for (const id of orderedIds) if (!existing.has(id)) return { ok: false, error: 'wrong_tournament' }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('tournament_competitors')
      .update({ display_order: i })
      .eq('id', orderedIds[i])
      .eq('event_id', eventId)
    if (error) return { ok: false, error: 'unknown' }
  }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'competitors_reordered',
    detail: { count: orderedIds.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, id: eventId }
}

export async function bulkCreateCompetitors(
  tournamentId: string,
  eventId: string,
  rawText: string,
): Promise<BulkMutationResult> {
  if (!(await may(tournamentId, 'competitor.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.matchCount > 0) return { ok: false, error: 'event_locked' }

  const parsed = parseBulkCompetitors(rawText ?? '')
  if (parsed.tooMany) return { ok: false, error: 'bulk_too_many' }
  if (parsed.unique.length === 0) return { ok: false, error: 'bulk_empty' }
  if (parsed.duplicateNames.length > 0) {
    return { ok: false, error: 'bulk_duplicate_input', names: [...parsed.duplicateNames] }
  }

  // Duplicate against the existing roster (case/space-insensitive) — app-layer guard since the
  // schema has no unique(event_id, name). All-or-nothing: reject the whole batch, write nothing.
  const keys = await existingNameKeys(admin, eventId)
  const collisions = parsed.unique.filter((n) => keys.has(competitorNameKey(n)))
  if (collisions.length > 0) return { ok: false, error: 'bulk_duplicate_existing', names: collisions }

  const start = await nextDisplayOrder(admin, 'tournament_competitors', 'event_id', eventId)
  const rows = parsed.unique.map((name, i) => ({
    event_id: eventId,
    name,
    display_order: start + i,
  }))

  // Single INSERT of the whole array → atomic; never leaves a half-added state the UI reads as done.
  const { data, error } = await admin.from('tournament_competitors').insert(rows).select('id')
  if (error || !data) return { ok: false, error: 'unknown' }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'competitors_bulk_created',
    detail: { count: data.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, created: data.length }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// GROUP-STAGE ACTIONS (Prompt 06 — round_robin & group_knockout only)
// ══════════════════════════════════════════════════════════════════════════════════════════
// Same discipline as above. The heavy lifting (atomic replace-all save, atomic generate/regenerate
// with concurrency + result guards) lives in service-role-only DEFINER RPCs from
// migration_tournament_group_assignment.sql; these actions only authenticate, verify ownership,
// re-load ground truth from the DB (NEVER trust the client preview), validate with the pure domain
// engine, and map the RPC's jsonb {code} to a typed result. generateRoundRobin is used verbatim —
// the schedule algorithm is never re-implemented here.

// Map the RPC's {code} into a typed GroupMutationError. Unrecognized codes → 'unknown'.
function mapGroupCode(code: string | undefined): GroupMutationError {
  switch (code) {
    case 'version_conflict':
      return 'version_conflict'
    case 'not_found':
      return 'not_found'
    case 'wrong_format':
      return 'wrong_format'
    case 'has_matches':
      return 'has_matches'
    case 'would_orphan':
      return 'would_orphan'
    case 'event_has_results':
      return 'event_has_results'
    case 'event_has_knockout':
      return 'event_has_knockout'
    case 'invalid':
      return 'invalid'
    default:
      return 'unknown'
  }
}

interface GroupBuildState {
  competitorNames: Map<string, string>
  groups: { id: string }[]
  ordered: Record<string, string[]> // groupId → membership-ordered competitor ids
  unassignedIds: string[]
}

// Re-load the event's competitors, groups and current memberships → the ground truth used to
// validate a save payload and to build the matches to generate. Never trusts the client.
async function loadGroupState(admin: SupabaseClient, eventId: string): Promise<GroupBuildState> {
  const [{ data: comps }, { data: grps }, { data: mems }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id, name')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_groups')
      .select('id')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true }),
    admin
      .from('tournament_group_memberships')
      .select('group_id, competitor_id, display_order')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true }),
  ])

  const competitorNames = new Map<string, string>()
  for (const c of (comps as { id: string; name: string }[] | null) ?? []) competitorNames.set(c.id, c.name)

  const groups = ((grps as { id: string }[] | null) ?? []).map((g) => ({ id: g.id }))
  const ordered: Record<string, string[]> = {}
  for (const g of groups) ordered[g.id] = []
  const placed = new Set<string>()
  for (const m of (mems as { group_id: string; competitor_id: string }[] | null) ?? []) {
    if (ordered[m.group_id]) {
      ordered[m.group_id].push(m.competitor_id)
      placed.add(m.competitor_id)
    }
  }
  const unassignedIds = Array.from(competitorNames.keys()).filter((id) => !placed.has(id))

  return { competitorNames, groups, ordered, unassignedIds }
}

// Build the DB-shaped match rows from ground truth via the pure engine (generateRoundRobin per
// group). Returns null when the current assignment is not ready to generate (readiness issues).
function buildMatchRowsFromState(
  state: GroupBuildState,
  format: GroupStageFormat,
  winnerQualifiersPerGroup: number,
  consolationQualifiersPerGroup: number,
): Record<string, unknown>[] | null {
  const payload: AssignmentPayload = {
    groups: state.groups.map((g) => ({ groupId: g.id, competitorIds: state.ordered[g.id] ?? [] })),
    unassignedIds: state.unassignedIds,
  }
  const readiness = evaluateReadiness(payload, {
    format,
    winnerQualifiersPerGroup,
    consolationQualifiersPerGroup,
  })
  if (!readiness.ok) return null

  const matches = buildRoundRobinMatches(
    state.groups.map((g) => ({
      groupId: g.id,
      competitors: (state.ordered[g.id] ?? []).map((id) => ({
        id,
        name: state.competitorNames.get(id) ?? id,
      })),
    })),
  )
  return matches.map((m) => ({
    group_id: m.groupId,
    round_number: m.roundNumber,
    match_number: m.matchNumber,
    competitor_a_id: m.competitorAId,
    competitor_b_id: m.competitorBId,
    generation_key: m.generationKey,
  }))
}

export async function initializeTournamentGroups(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<GroupMutationResult> {
  if (!(await may(tournamentId, 'group.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  const names = groupLetters(ev.groupCount)
  const { data, error } = await admin.rpc('tournament_initialize_groups', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_names: names,
  })
  if (error) return { ok: false, error: 'unknown' }

  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapGroupCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'groups_initialized',
    detail: { group_count: names.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

export async function saveGroupAssignments(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  payload: AssignmentPayload,
): Promise<GroupMutationResult> {
  if (!(await may(tournamentId, 'group.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }
  if (!payload || !Array.isArray(payload.groups) || !Array.isArray(payload.unassignedIds)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  // Validate the desired-state payload against RE-LOADED truth (anti-tamper): a valid permutation
  // of the event's competitors across its groups, everyone accounted for exactly once.
  const state = await loadGroupState(admin, eventId)
  const validation = validateAssignmentPayload(payload, {
    competitorIds: Array.from(state.competitorNames.keys()),
    groupIds: state.groups.map((g) => g.id),
  })
  if (!validation.ok) return { ok: false, error: 'invalid' }

  const assignments = payload.groups.map((g) => ({
    group_id: g.groupId,
    competitor_ids: g.competitorIds,
  }))
  const { data, error } = await admin.rpc('tournament_save_group_assignments', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_assignments: assignments,
  })
  if (error) return { ok: false, error: 'unknown' }

  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapGroupCode(code) }

  const assigned = payload.groups.reduce((n, g) => n + g.competitorIds.length, 0)
  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_assignments_updated',
    detail: { group_count: payload.groups.length, competitor_count: assigned },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

export async function generateGroupMatches(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<GroupMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  const state = await loadGroupState(admin, eventId)
  const rows = buildMatchRowsFromState(
    state,
    ev.format as GroupStageFormat,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
  )
  if (rows === null) return { ok: false, error: 'not_ready' }

  const { data, error } = await admin.rpc('tournament_generate_group_matches', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_matches: rows,
  })
  if (error) return { ok: false, error: 'unknown' }

  const result = data as { code?: string; match_count?: number } | null
  const code = result?.code
  if (code === 'already_generated') {
    return { ok: true, alreadyGenerated: true, matchCount: result?.match_count ?? 0 }
  }
  if (code !== 'ok') return { ok: false, error: mapGroupCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_matches_generated',
    detail: { group_count: state.groups.length, match_count: result?.match_count ?? rows.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, matchCount: result?.match_count ?? rows.length }
}

export async function regenerateGroupMatches(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  confirm: boolean,
): Promise<GroupMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion) || confirm !== true) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  const state = await loadGroupState(admin, eventId)
  const rows = buildMatchRowsFromState(
    state,
    ev.format as GroupStageFormat,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
  )
  if (rows === null) return { ok: false, error: 'not_ready' }

  const { data, error } = await admin.rpc('tournament_regenerate_group_matches', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_matches: rows,
  })
  if (error) return { ok: false, error: 'unknown' }

  const result = data as { code?: string; match_count?: number } | null
  const code = result?.code
  if (code !== 'ok') return { ok: false, error: mapGroupCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_matches_regenerated',
    detail: { group_count: state.groups.length, match_count: result?.match_count ?? rows.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, matchCount: result?.match_count ?? rows.length }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// SCORING & QUALIFICATION-OVERRIDE ACTIONS (Prompt 07 — round_robin & group_knockout)
// ══════════════════════════════════════════════════════════════════════════════════════════
// Same discipline: authenticate → may(tournamentId, <permission>) → verify event↔tournament + not knockout → RELOAD
// ground truth from the DB → validate with the pure engine (deriveMatchOutcome via validateMatchScores;
// resolveTieOrder) → compute the event's precise target status with evaluateGroupStage → apply
// atomically via a service-role-only DEFINER RPC (match/event version guard) → audit → revalidate.
// The winner is NEVER re-derived here; the RPC never trusts a client winner beyond the DB CHECKs.

// Map a scoring/override RPC {code} into a typed ScoreMutationError.
function mapScoreCode(code: string | undefined): ScoreMutationError {
  switch (code) {
    case 'version_conflict':
      return 'version_conflict'
    case 'not_found':
      return 'not_found'
    case 'wrong_stage':
      return 'wrong_stage'
    case 'not_scoreable':
      return 'not_scoreable'
    case 'has_knockout':
      return 'has_knockout'
    case 'invalid':
      return 'invalid'
    default:
      return 'unknown'
  }
}

interface EvalMatch {
  id: string
  input: MatchInput
}

interface GroupEvalRaw {
  groupIds: string[]
  competitorsByGroup: Map<string, Competitor[]>
  matchesByGroup: Map<string, EvalMatch[]>
  overridesByGroup: Map<string, string[]>
  matchById: Map<string, { groupId: string | null }>
}

// Re-load the whole group stage as pure-engine inputs (roster + matches + games + overrides). This
// is the DB truth the actions evaluate against — never the client. Only stage='group' matches.
async function loadGroupEvalRaw(admin: SupabaseClient, eventId: string): Promise<GroupEvalRaw> {
  const [{ data: comps }, { data: grps }, { data: mems }, { data: matchRows }, { data: overrides }] =
    await Promise.all([
      admin.from('tournament_competitors').select('id, name').eq('event_id', eventId),
      admin
        .from('tournament_groups')
        .select('id')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_group_memberships')
        .select('group_id, competitor_id, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_matches')
        .select('id, group_id, stage, status, competitor_a_id, competitor_b_id, winner_competitor_id')
        .eq('event_id', eventId),
      admin
        .from('tournament_qualification_overrides')
        .select('group_id, resolved_order')
        .eq('event_id', eventId),
    ])

  const nameById = new Map<string, string>()
  for (const c of (comps as { id: string; name: string }[] | null) ?? []) nameById.set(c.id, c.name)

  const groupIds = ((grps as { id: string }[] | null) ?? []).map((g) => g.id)
  const competitorsByGroup = new Map<string, Competitor[]>()
  for (const id of groupIds) competitorsByGroup.set(id, [])
  for (const m of (mems as { group_id: string; competitor_id: string }[] | null) ?? []) {
    const list = competitorsByGroup.get(m.group_id)
    if (list) list.push({ id: m.competitor_id, name: nameById.get(m.competitor_id) ?? m.competitor_id })
  }

  const groupMatches = ((matchRows as {
    id: string
    group_id: string | null
    stage: string
    status: string
    competitor_a_id: string | null
    competitor_b_id: string | null
    winner_competitor_id: string | null
  }[] | null) ?? []).filter((m) => m.stage === 'group')

  // Games for the group matches (one query).
  const gamesByMatch = new Map<string, { gameNumber: number; scoreA: number; scoreB: number }[]>()
  if (groupMatches.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id, game_number, score_a, score_b')
      .in('match_id', groupMatches.map((m) => m.id))
      .order('game_number', { ascending: true })
    for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
      const list = gamesByMatch.get(g.match_id)
      const view = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
      if (list) list.push(view)
      else gamesByMatch.set(g.match_id, [view])
    }
  }

  const matchesByGroup = new Map<string, EvalMatch[]>()
  const matchById = new Map<string, { groupId: string | null }>()
  for (const id of groupIds) matchesByGroup.set(id, [])
  for (const m of groupMatches) {
    matchById.set(m.id, { groupId: m.group_id })
    if (!m.group_id) continue
    const input: MatchInput = {
      competitorAId: m.competitor_a_id,
      competitorBId: m.competitor_b_id,
      status: m.status as MatchInput['status'],
      games: gamesByMatch.get(m.id) ?? [],
      winnerId: m.winner_competitor_id,
    }
    matchesByGroup.get(m.group_id)?.push({ id: m.id, input })
  }

  const overridesByGroup = new Map<string, string[]>()
  for (const o of (overrides as { group_id: string; resolved_order: unknown }[] | null) ?? []) {
    if (Array.isArray(o.resolved_order)) overridesByGroup.set(o.group_id, o.resolved_order as string[])
  }

  return { groupIds, competitorsByGroup, matchesByGroup, overridesByGroup, matchById }
}

// Build engine inputs from the (possibly locally-mutated) raw truth and evaluate → target status.
// `tablePoints` (Prompt 15D-1) comes from the event rule snapshot; omitted ⇒ classic win 1 / loss 0.
function evalTargetStatus(
  raw: GroupEvalRaw,
  format: GroupStageFormat,
  winnerQualifiers: number,
  consolationQualifiers: number,
  tablePoints?: TablePointsConfig,
): EventProgressStatus {
  const groups: GroupEvaluationInput[] = raw.groupIds.map((id) => ({
    groupId: id,
    competitors: raw.competitorsByGroup.get(id) ?? [],
    matches: (raw.matchesByGroup.get(id) ?? []).map((m) => m.input),
    resolvedOrder: raw.overridesByGroup.get(id),
  }))
  return evaluateGroupStage({ format, winnerQualifiers, consolationQualifiers, groups, tablePoints }).status
}

// ── Save (create / update) a group match result ──────────────────────────────────────────────
export async function saveGroupMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
  games: ScoreGameInput[],
): Promise<ScoreMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }
  if (!Array.isArray(games)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  // Load the match, PROVING it belongs to this event, and that it is a real scoreable group pairing.
  const { data: matchRow } = await admin
    .from('tournament_matches')
    .select('id, event_id, group_id, stage, status, competitor_a_id, competitor_b_id, version')
    .eq('id', matchId)
    .maybeSingle()
  const match = matchRow as unknown as {
    id: string
    event_id: string
    group_id: string | null
    stage: string
    status: string
    competitor_a_id: string | null
    competitor_b_id: string | null
    version: number
  } | null
  if (!match || match.event_id !== eventId) return { ok: false, error: 'not_found' }
  if (match.stage !== 'group') return { ok: false, error: 'wrong_stage' }
  if (
    (match.status !== 'ready' && match.status !== 'completed') ||
    !match.competitor_a_id ||
    !match.competitor_b_id
  ) {
    return { ok: false, error: 'not_scoreable' }
  }

  // Judge the score against the event's rule snapshot (or the legacy engine when there is none) and
  // derive the winner — never re-implemented here or in the RPC, never trusted from the client.
  const resolved = await resolveMatchScore({
    eventId,
    competitorAId: match.competitor_a_id,
    competitorBId: match.competitor_b_id,
    stage: { stage: match.stage, bracket: null, status: match.status },
    games,
  })
  if (!resolved.ok) {
    return resolved.gameNumber
      ? { ok: false, error: resolved.error, gameNumber: resolved.gameNumber }
      : { ok: false, error: resolved.error }
  }
  const scored = resolved.value

  // Compute the precise target event status: reload truth, apply THIS edit (completed + drop this
  // group's now-stale override), evaluate. The RPC clamps the status to SQL completion as a backstop.
  const raw = await loadGroupEvalRaw(admin, eventId)
  if (match.group_id) {
    const list = raw.matchesByGroup.get(match.group_id)
    const target = list?.find((m) => m.id === matchId)
    if (target) {
      const editedInput: MatchInput = {
        competitorAId: match.competitor_a_id,
        competitorBId: match.competitor_b_id,
        status: 'completed',
        games: scored.games.map((g) => ({ gameNumber: g.gameNumber, scoreA: g.scoreA, scoreB: g.scoreB })),
        winnerId: scored.winnerId,
      }
      list!.splice(list!.indexOf(target), 1, { id: matchId, input: editedInput })
    }
    raw.overridesByGroup.delete(match.group_id) // the RPC drops it; mirror it for the evaluation
  }
  const targetStatus = evalTargetStatus(
    raw,
    ev.format as GroupStageFormat,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
    await getEventGroupTablePoints(eventId),
  )

  const gamesPayload = toGamesPayload(scored)
  const { data, error } = await admin.rpc('tournament_save_match_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
    p_games: gamesPayload,
    p_winner_id: scored.winnerId,
    p_target_status: targetStatus,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string } | null
  if (result?.code !== 'ok') return { ok: false, error: mapScoreCode(result?.code) }

  const created = match.status !== 'completed'
  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: created ? 'group_match_result_created' : 'group_match_result_updated',
    detail: {
      match_id: matchId,
      group_id: match.group_id,
      status_before: match.status,
      status_after: 'completed',
      winner_after: scored.winnerId,
      games_won: `${scored.gamesWonA}-${scored.gamesWonB}`,
      event_status_after: result.status ?? targetStatus,
      rule: scored.audit,
    },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Clear a group match result ───────────────────────────────────────────────────────────────
export async function clearGroupMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
): Promise<ScoreMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  const { data: matchRow } = await admin
    .from('tournament_matches')
    .select('id, event_id, group_id, stage, status, winner_competitor_id, version')
    .eq('id', matchId)
    .maybeSingle()
  const match = matchRow as unknown as {
    id: string
    event_id: string
    group_id: string | null
    stage: string
    status: string
    winner_competitor_id: string | null
    version: number
  } | null
  if (!match || match.event_id !== eventId) return { ok: false, error: 'not_found' }
  if (match.stage !== 'group') return { ok: false, error: 'wrong_stage' }
  if (match.status !== 'completed') return { ok: false, error: 'not_scoreable' }

  const { data, error } = await admin.rpc('tournament_clear_match_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string } | null
  if (result?.code !== 'ok') return { ok: false, error: mapScoreCode(result?.code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_match_result_cleared',
    detail: {
      match_id: matchId,
      group_id: match.group_id,
      status_before: 'completed',
      status_after: 'ready',
      winner_before: match.winner_competitor_id,
      event_status_after: result.status ?? 'group_stage',
    },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Save a qualification override (manual tie resolution) ─────────────────────────────────────
export async function saveQualificationOverride(
  tournamentId: string,
  eventId: string,
  groupId: string,
  expectedEventVersion: number,
  orderedTieIds: string[],
  reason: string | null,
): Promise<ScoreMutationResult> {
  if (!(await may(tournamentId, 'tie.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !groupId || !Number.isInteger(expectedEventVersion)) {
    return { ok: false, error: 'invalid' }
  }
  if (!Array.isArray(orderedTieIds) || orderedTieIds.length === 0) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  // The group must belong to this event (anti-IDOR).
  const { data: groupRow } = await admin
    .from('tournament_groups')
    .select('id, event_id')
    .eq('id', groupId)
    .maybeSingle()
  if (!groupRow || (groupRow as { event_id: string }).event_id !== eventId) {
    return { ok: false, error: 'not_found' }
  }

  const raw = await loadGroupEvalRaw(admin, eventId)
  const competitors = raw.competitorsByGroup.get(groupId) ?? []
  const matches = (raw.matchesByGroup.get(groupId) ?? []).map((m) => m.input)
  // Standings are override-independent → validate the proposed order against the CURRENT standings.
  // Rank against standings using the snapshot's table points (§15) — override validation must use the
  // same ranking the standings display + qualification use.
  const groupTablePoints = await getEventGroupTablePoints(eventId)
  const standings = calculateStandings({ competitors, matches, tablePoints: groupTablePoints })
  const resolved = resolveTieOrder({ standings, orderedTieIds })
  if (!resolved.ok) {
    return { ok: false, error: resolved.code === 'NO_SUCH_TIE' ? 'no_such_tie' : 'invalid' }
  }

  // Target status WITH the new override applied to this group.
  raw.overridesByGroup.set(groupId, [...resolved.resolvedOrder])
  const targetStatus = evalTargetStatus(
    raw,
    ev.format as GroupStageFormat,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
    groupTablePoints,
  )

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : ''
  const { data, error } = await admin.rpc('tournament_save_qualification_override', {
    p_event_id: eventId,
    p_group_id: groupId,
    p_expected_event_version: expectedEventVersion,
    p_resolved_order: [...resolved.resolvedOrder],
    p_reason: cleanReason.length > 0 ? cleanReason : null,
    p_actor: actorId,
    p_target_status: targetStatus,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string } | null
  if (result?.code !== 'ok') return { ok: false, error: mapScoreCode(result?.code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'qualification_override_created',
    detail: {
      group_id: groupId,
      resolved_order: [...resolved.resolvedOrder],
      tie_group: [...orderedTieIds],
      event_status_after: result.status ?? targetStatus,
    },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Delete a qualification override (back to unresolved) ──────────────────────────────────────
export async function deleteQualificationOverride(
  tournamentId: string,
  eventId: string,
  groupId: string,
  expectedEventVersion: number,
): Promise<ScoreMutationResult> {
  if (!(await may(tournamentId, 'tie.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !groupId || !Number.isInteger(expectedEventVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format === 'knockout') return { ok: false, error: 'wrong_format' }

  const { data: groupRow } = await admin
    .from('tournament_groups')
    .select('id, event_id')
    .eq('id', groupId)
    .maybeSingle()
  if (!groupRow || (groupRow as { event_id: string }).event_id !== eventId) {
    return { ok: false, error: 'not_found' }
  }

  // Target status WITHOUT this group's override (removing it may re-block knockout_ready).
  const raw = await loadGroupEvalRaw(admin, eventId)
  raw.overridesByGroup.delete(groupId)
  const targetStatus = evalTargetStatus(
    raw,
    ev.format as GroupStageFormat,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
    await getEventGroupTablePoints(eventId),
  )

  const { data, error } = await admin.rpc('tournament_delete_qualification_override', {
    p_event_id: eventId,
    p_group_id: groupId,
    p_expected_event_version: expectedEventVersion,
    p_target_status: targetStatus,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string } | null
  if (result?.code !== 'ok') return { ok: false, error: mapScoreCode(result?.code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'qualification_override_deleted',
    detail: { group_id: groupId, event_status_after: result.status ?? targetStatus },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// KNOCKOUT-ONLY ACTIONS (Prompt 08 — event format 'knockout'; group_knockout is Prompt 09)
// ══════════════════════════════════════════════════════════════════════════════════════════
// Same discipline: authenticate → may(tournamentId, <permission>) → verify event↔tournament + format='knockout' →
// RELOAD ground truth from the DB (NEVER trust client seed order / match ids / winner / version) →
// validate & build with the pure engine (validateSeedPayload / generateKnockout / progressKnockout /
// calculatePodium; the winner via deriveMatchOutcome through validateMatchScores) → apply atomically
// via a service-role-only DEFINER RPC (version guards, downstream-result guards, podium clamp) →
// audit → revalidate. Seed order is materialized by array index — the client's slot value is ignored.

function mapKnockoutCode(code: string | undefined): KnockoutMutationError {
  switch (code) {
    case 'version_conflict': return 'version_conflict'
    case 'not_found': return 'not_found'
    case 'wrong_format': return 'wrong_format'
    case 'wrong_stage': return 'wrong_stage'
    case 'not_scoreable': return 'not_scoreable'
    case 'has_matches': return 'has_matches'
    case 'already_generated': return 'already_generated'
    case 'event_has_results': return 'event_has_results'
    case 'downstream_has_results': return 'downstream_has_results'
    case 'invalid': return 'invalid'
    default: return 'unknown'
  }
}

interface KnockoutSeedState {
  competitorIds: string[]
  seededIds: string[]
  unassignedIds: string[]
}

// Re-load the event's competitors + current championship seed slots → the ground truth used to
// validate a save and to build the bracket. Never trusts the client.
async function loadKnockoutSeedState(admin: SupabaseClient, eventId: string): Promise<KnockoutSeedState> {
  const [{ data: comps }, { data: slots }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_knockout_seed_slots')
      .select('slot_index, competitor_id, source_type')
      .eq('event_id', eventId)
      .eq('bracket', 'championship')
      .order('slot_index', { ascending: true }),
  ])
  const competitorIds = ((comps as { id: string }[] | null) ?? []).map((c) => c.id)
  const known = new Set(competitorIds)
  const seededIds: string[] = []
  const seen = new Set<string>()
  for (const s of (slots as { slot_index: number; competitor_id: string | null; source_type: string }[] | null) ?? []) {
    if (s.source_type === 'competitor' && s.competitor_id && known.has(s.competitor_id) && !seen.has(s.competitor_id)) {
      seededIds.push(s.competitor_id)
      seen.add(s.competitor_id)
    }
  }
  const unassignedIds = competitorIds.filter((id) => !seen.has(id))
  return { competitorIds, seededIds, unassignedIds }
}

interface KnockoutMatchRecord {
  id: string
  generationKey: string
  bracket: string
  roundNumber: number
  matchNumber: number
  status: string
  version: number
  competitorAId: string | null
  competitorBId: string | null
  winnerId: string | null
  sourceMatchAId: string | null
  sourceMatchBId: string | null
  sourceOutcomeA: string | null
  sourceOutcomeB: string | null
}

interface KnockoutBoard {
  records: KnockoutMatchRecord[]
  byId: Map<string, KnockoutMatchRecord>
  keyToId: Map<string, string>
}

// Re-load ALL knockout matches for the event as the ground truth for progression / podium / clear.
async function loadKnockoutMatches(admin: SupabaseClient, eventId: string): Promise<KnockoutBoard> {
  const { data } = await admin
    .from('tournament_matches')
    .select(
      'id, generation_key, bracket, round_number, match_number, status, version, competitor_a_id, competitor_b_id, ' +
        'winner_competitor_id, source_match_a_id, source_match_b_id, source_outcome_a, source_outcome_b',
    )
    .eq('event_id', eventId)
    .eq('stage', 'knockout')
  const records: KnockoutMatchRecord[] = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: r.id as string,
    generationKey: r.generation_key as string,
    bracket: (r.bracket as string | null) ?? 'championship',
    roundNumber: r.round_number as number,
    matchNumber: r.match_number as number,
    status: r.status as string,
    version: r.version as number,
    competitorAId: (r.competitor_a_id as string | null) ?? null,
    competitorBId: (r.competitor_b_id as string | null) ?? null,
    winnerId: (r.winner_competitor_id as string | null) ?? null,
    sourceMatchAId: (r.source_match_a_id as string | null) ?? null,
    sourceMatchBId: (r.source_match_b_id as string | null) ?? null,
    sourceOutcomeA: (r.source_outcome_a as string | null) ?? null,
    sourceOutcomeB: (r.source_outcome_b as string | null) ?? null,
  }))
  const byId = new Map(records.map((r) => [r.id, r]))
  const keyToId = new Map(records.map((r) => [r.generationKey, r.id]))
  return { records, byId, keyToId }
}

// Reconstruct the pure bracket (for progressKnockout) from the loaded rows.
function toDbBracket(board: KnockoutBoard): DbKnockoutMatch[] {
  const keyById = new Map(board.records.map((r) => [r.id, r.generationKey]))
  return board.records.map((r) => {
    const slotFrom = (outcome: string | null, sourceId: string | null, comp: string | null): DbKnockoutMatch['slotA'] => {
      if (outcome === 'winner' || outcome === 'loser') return { from: outcome, matchKey: sourceId ? keyById.get(sourceId) ?? null : null }
      return { from: comp ? 'entrant' : 'bye' }
    }
    return {
      matchKey: r.generationKey,
      bracket: 'championship',
      roundNumber: r.roundNumber,
      matchNumber: r.matchNumber,
      roundLabel: `round_${r.roundNumber}`,
      slotA: slotFrom(r.sourceOutcomeA, r.sourceMatchAId, r.competitorAId),
      slotB: slotFrom(r.sourceOutcomeB, r.sourceMatchBId, r.competitorBId),
      isThirdPlace: r.sourceOutcomeA === 'loser' && r.sourceOutcomeB === 'loser',
    }
  })
}

// ── Save the full seed state ─────────────────────────────────────────────────────────────────
export async function saveKnockoutSeeds(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  payload: SeedPayload,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }
  if (!payload || !Array.isArray(payload.seededIds) || !Array.isArray(payload.unassignedIds)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }
  if (ev.matchCount > 0) return { ok: false, error: 'has_matches' }

  // Validate the desired seed state against RE-LOADED truth: a permutation of the event's competitors.
  const state = await loadKnockoutSeedState(admin, eventId)
  const validation = validateSeedPayload(payload, { competitorIds: state.competitorIds })
  if (!validation.ok) return { ok: false, error: 'invalid' }

  const slots = payload.seededIds.map((id, i) => ({ slot_index: i, competitor_id: id }))
  const { data, error } = await admin.rpc('tournament_save_knockout_seeds', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_slots: slots,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'knockout_seeds_updated',
    detail: { seed_count: payload.seededIds.length, unassigned_count: payload.unassignedIds.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Clear all seeds ──────────────────────────────────────────────────────────────────────────
export async function clearKnockoutSeeds(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }
  if (ev.matchCount > 0) return { ok: false, error: 'has_matches' }

  const { data, error } = await admin.rpc('tournament_clear_knockout_seeds', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'knockout_seeds_updated',
    detail: { cleared: true },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Generate the bracket (idempotent) ──────────────────────────────────────────────────────────
export async function generateKnockoutBracket(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }

  // Re-load seeds from DB truth and re-validate before generating.
  const state = await loadKnockoutSeedState(admin, eventId)
  const permutation = validateSeedPayload(
    { seededIds: state.seededIds, unassignedIds: state.unassignedIds },
    { competitorIds: state.competitorIds },
  )
  if (!permutation.ok) return { ok: false, error: 'invalid' }
  const readiness = evaluateSeedReadiness({ seededIds: state.seededIds, unassignedIds: state.unassignedIds })
  if (!readiness.ok) return { ok: false, error: 'not_ready' }

  const bracket = buildKnockoutBracketFromSeeds(state.seededIds, ev.thirdPlaceEnabled)
  const rows = buildKnockoutMatchRows(bracket).map((m) => ({
    generation_key: m.generationKey,
    round_number: m.roundNumber,
    match_number: m.matchNumber,
    competitor_a_id: m.competitorAId,
    competitor_b_id: m.competitorBId,
    status: m.status,
    winner_id: m.winnerId,
    source_a_key: m.sourceAKey,
    source_a_outcome: m.sourceAOutcome,
    source_b_key: m.sourceBKey,
    source_b_outcome: m.sourceBOutcome,
  }))

  const { data, error } = await admin.rpc('tournament_generate_knockout', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_matches: rows,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; match_count?: number } | null
  const code = result?.code
  if (code === 'already_generated') {
    return { ok: true, alreadyGenerated: true, matchCount: result?.match_count ?? 0 }
  }
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'knockout_bracket_generated',
    detail: { bracket_size: bracket.size, byes: bracket.byes, match_count: result?.match_count ?? rows.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, matchCount: result?.match_count ?? rows.length }
}

// ── Reset the bracket (only when there are no results) ─────────────────────────────────────────
export async function resetKnockoutBracket(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  confirm: boolean,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion) || confirm !== true) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }

  const { data, error } = await admin.rpc('tournament_reset_knockout', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'knockout_bracket_reset',
    detail: {},
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// Derive a completed match's winner/loser from the board record (winner + the two competitors).
function outcomeOf(rec: KnockoutMatchRecord | undefined): { winnerId: string; loserId: string } | null {
  if (!rec || rec.status !== 'completed' || !rec.winnerId || !rec.competitorAId || !rec.competitorBId) return null
  const loserId = rec.winnerId === rec.competitorAId ? rec.competitorBId : rec.competitorAId
  return { winnerId: rec.winnerId, loserId }
}

// Compute the podium (championship bracket) from the post-edit board, reusing calculatePodium. The
// final is the terminal non-third match; the third-place match is the two-loser-fed one; joint third
// (no third-place match) uses the two semifinal losers (the matches feeding the final).
function computeKnockoutPodium(board: KnockoutBoard): ReturnType<typeof calculatePodium> {
  const referenced = new Set<string>()
  for (const r of board.records) {
    if (r.sourceMatchAId) referenced.add(r.sourceMatchAId)
    if (r.sourceMatchBId) referenced.add(r.sourceMatchBId)
  }
  const third = board.records.find((r) => r.sourceOutcomeA === 'loser' && r.sourceOutcomeB === 'loser') ?? null
  const finalRec = board.records.find((r) => r.id !== third?.id && !referenced.has(r.id)) ?? null

  const finalOutcome = outcomeOf(finalRec ?? undefined)
  const semifinalIds = [finalRec?.sourceMatchAId, finalRec?.sourceMatchBId].filter((x): x is string => !!x)
  const semifinalLosers = semifinalIds
    .map((id) => outcomeOf(board.byId.get(id))?.loserId)
    .filter((x): x is string => !!x)

  const input: PodiumInput = {
    final: finalOutcome,
    thirdPlaceEnabled: third !== null,
    thirdPlace: third ? (outcomeOf(third) ? { winnerId: outcomeOf(third)!.winnerId } : null) : null,
    semifinalLosers,
  }
  return calculatePodium(input)
}

// ── Save (create / update) a knockout match result ─────────────────────────────────────────────
export async function saveKnockoutMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
  games: ScoreGameInput[],
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }
  if (!Array.isArray(games)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }

  // Re-load the board (ground truth) and verify the match is a real, scoreable knockout pairing.
  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(matchId)
  if (!match) return { ok: false, error: 'not_found' }
  if (
    (match.status !== 'ready' && match.status !== 'completed') ||
    !match.competitorAId ||
    !match.competitorBId
  ) {
    return { ok: false, error: 'not_scoreable' }
  }

  // Judge the score against the event's rule snapshot (knockout rules) or the legacy engine, and
  // derive the winner — never re-implemented here or in the RPC, never trusted from the client.
  const resolved = await resolveMatchScore({
    eventId,
    competitorAId: match.competitorAId,
    competitorBId: match.competitorBId,
    stage: { stage: 'knockout', bracket: match.bracket, status: match.status },
    games,
  })
  if (!resolved.ok) {
    return resolved.gameNumber
      ? { ok: false, error: resolved.error, gameNumber: resolved.gameNumber }
      : { ok: false, error: resolved.error }
  }
  const scored = resolved.value
  const loserId = scored.loserId

  // Compute downstream progression via progressKnockout (winner → next slot; SF loser → third place).
  const dbBracket = reconstructBracketForProgression(toDbBracket(board))
  const progression = progressKnockout({
    bracket: dbBracket,
    completedMatchKey: match.generationKey,
    winnerId: scored.winnerId,
    loserId,
  })
  const patches = progression.patches
    .map((p) => {
      const targetId = board.keyToId.get(p.matchKey)
      return targetId ? { match_id: targetId, slot: p.slot, competitor_id: p.competitorId } : null
    })
    .filter((x): x is { match_id: string; slot: 'A' | 'B'; competitor_id: string } => x !== null)

  // Overlay this edit onto the board to compute podium + completion (calculatePodium).
  const post = await loadKnockoutMatches(admin, eventId)
  const editRec = post.byId.get(matchId)
  if (editRec) {
    editRec.status = 'completed'
    editRec.winnerId = scored.winnerId
  }
  for (const p of patches) {
    const t = post.byId.get(p.match_id)
    if (!t) continue
    if (p.slot === 'A') t.competitorAId = p.competitor_id
    else t.competitorBId = p.competitor_id
  }
  const podium = computeKnockoutPodium(post)
  const podiumPayload =
    podium.status === 'ready'
      ? podium.entries.map((e) => ({ rank: e.rank, competitor_id: e.competitorId, is_joint: e.isJoint }))
      : null
  const targetStatus = podium.status === 'ready' ? 'completed' : 'knockout_running'

  const gamesPayload = toGamesPayload(scored)
  const { data, error } = await admin.rpc('tournament_save_knockout_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
    p_games: gamesPayload,
    p_winner_id: scored.winnerId,
    p_patches: patches,
    p_podium: podiumPayload,
    p_event_status: targetStatus,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string; completed?: boolean } | null
  if (result?.code !== 'ok') return { ok: false, error: mapKnockoutCode(result?.code) }

  const created = match.status !== 'completed'
  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: created ? 'knockout_result_created' : 'knockout_result_updated',
    detail: {
      match_id: matchId,
      winner_after: scored.winnerId,
      games_won: `${scored.gamesWonA}-${scored.gamesWonB}`,
      event_status_after: result.status ?? targetStatus,
      rule: scored.audit,
    },
  })
  if (patches.length > 0) {
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'knockout_progressed',
      detail: { match_id: matchId, advanced: patches.length },
    })
  }
  if (result.completed) {
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'podium_calculated',
      detail: { match_id: matchId, ranks: podiumPayload?.length ?? 0 },
    })
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'event_completed',
      detail: { match_id: matchId },
    })
  }
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Clear a knockout match result ──────────────────────────────────────────────────────────────
export async function clearKnockoutMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout') return { ok: false, error: 'wrong_format' }

  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(matchId)
  if (!match) return { ok: false, error: 'not_found' }
  if (match.status !== 'completed') return { ok: false, error: 'not_scoreable' }
  const current = outcomeOf(match)
  if (!current) return { ok: false, error: 'not_scoreable' }

  // Which downstream slots did this match fill? progressKnockout with the OLD winner/loser tells us.
  const dbBracket = reconstructBracketForProgression(toDbBracket(board))
  const progression = progressKnockout({
    bracket: dbBracket,
    completedMatchKey: match.generationKey,
    winnerId: current.winnerId,
    loserId: current.loserId,
  })
  const clearSlots = progression.patches
    .map((p) => {
      const targetId = board.keyToId.get(p.matchKey)
      return targetId ? { match_id: targetId, slot: p.slot } : null
    })
    .filter((x): x is { match_id: string; slot: 'A' | 'B' } => x !== null)

  const { data, error } = await admin.rpc('tournament_clear_knockout_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
    p_clear_slots: clearSlots,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'knockout_result_cleared',
    detail: { match_id: matchId, cleared_slots: clearSlots.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// GROUP + KNOCKOUT ACTIONS (Prompt 09 — event format 'group_knockout')
// ══════════════════════════════════════════════════════════════════════════════════════════
// Two INDEPENDENT brackets seeded from GROUP-RANK TOKENS (Nhất A / Nhì B …), not competitor ids.
// Same discipline as every other mutation: authenticate → may(tournamentId, <permission>) → verify event↔tournament
// + format='group_knockout' → RELOAD ground truth (roster / groups / standings / overrides / seeds /
// board — NEVER trust client tokens, order, winner or version) → recompute standings & qualification
// with the pure engine → validate/resolve tokens → apply atomically via a service-role DEFINER RPC
// (version guards, dual-branch transaction, per-branch podium, downstream-result guards) → audit →
// revalidate. Tokens are resolved to real competitors from the CURRENT standings only at generate time.

interface GroupKnockoutPayload {
  championship: SeedPayload
  consolation: SeedPayload | null
}

// Reload + evaluate the whole group stage → per-group qualification + the derived event status. This
// is the DB truth the seed/generate actions resolve tokens against (never the client).
function evaluateGkStage(
  raw: GroupEvalRaw,
  winnerQualifiers: number,
  consolationQualifiers: number,
  tablePoints?: TablePointsConfig,
): { qualificationByGroup: Map<string, QualificationOutcome>; status: EventProgressStatus; groupIds: string[] } {
  const groups: GroupEvaluationInput[] = raw.groupIds.map((id) => ({
    groupId: id,
    competitors: raw.competitorsByGroup.get(id) ?? [],
    matches: (raw.matchesByGroup.get(id) ?? []).map((m) => m.input),
    resolvedOrder: raw.overridesByGroup.get(id),
  }))
  const evaluation = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers,
    consolationQualifiers,
    groups,
    tablePoints,
  })
  const qualificationByGroup = new Map<string, QualificationOutcome>()
  for (const g of evaluation.groups) qualificationByGroup.set(g.groupId, g.qualification)
  return { qualificationByGroup, status: evaluation.status, groupIds: raw.groupIds }
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((x) => setB.has(x))
}

// Compute one bracket's podium from that bracket's records, reusing calculatePodium (structural
// final / third detection). Records must already be scoped to a single bracket.
function computeBracketPodium(records: KnockoutMatchRecord[]): ReturnType<typeof calculatePodium> {
  const byId = new Map(records.map((r) => [r.id, r]))
  const referenced = new Set<string>()
  for (const r of records) {
    if (r.sourceMatchAId) referenced.add(r.sourceMatchAId)
    if (r.sourceMatchBId) referenced.add(r.sourceMatchBId)
  }
  const third = records.find((r) => r.sourceOutcomeA === 'loser' && r.sourceOutcomeB === 'loser') ?? null
  const finalRec = records.find((r) => r.id !== third?.id && !referenced.has(r.id)) ?? null

  const finalOutcome = outcomeOf(finalRec ?? undefined)
  const semifinalIds = [finalRec?.sourceMatchAId, finalRec?.sourceMatchBId].filter((x): x is string => !!x)
  const semifinalLosers = semifinalIds
    .map((id) => outcomeOf(byId.get(id))?.loserId)
    .filter((x): x is string => !!x)

  const input: PodiumInput = {
    final: finalOutcome,
    thirdPlaceEnabled: third !== null,
    thirdPlace: third ? (outcomeOf(third) ? { winnerId: outcomeOf(third)!.winnerId } : null) : null,
    semifinalLosers,
  }
  return calculatePodium(input)
}

// ── Save the full desired seed state for BOTH branches ─────────────────────────────────────────
export async function saveGroupKnockoutSeeds(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  payload: GroupKnockoutPayload,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }
  if (!payload || !payload.championship || !Array.isArray(payload.championship.seededIds)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }
  // Block only when the KNOCKOUT bracket already exists — NOT merely because group-stage matches do
  // (they always do at seeding time). Using ev.matchCount here made saving seeds impossible.
  if (await hasKnockoutMatches(admin, eventId)) return { ok: false, error: 'has_matches' }

  // Reload the group stage and require it to be settled (knockout_ready) before seeding.
  const raw = await loadGroupEvalRaw(admin, eventId)
  const { status } = evaluateGkStage(
    raw,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
    await getEventGroupTablePoints(eventId),
  )
  if (status !== 'knockout_ready') return { ok: false, error: 'not_ready' }

  const { championship: champTokens, consolation: consoTokens } = buildGroupRankTokens({
    groups: raw.groupIds.map((id) => ({ groupId: id, competitorCount: (raw.competitorsByGroup.get(id) ?? []).length })),
    winnerQualifiers: ev.winnerQualifiersPerGroup,
    consolationQualifiers: ev.consolationQualifiersPerGroup,
  })
  const consolationEnabled = ev.consolationQualifiersPerGroup > 0

  // The payload's token set (per branch) must equal the CURRENT valid token set — otherwise the
  // qualification the admin saw is stale.
  const validChamp = champTokens.map((t) => t.tokenId)
  const payloadChamp = [...payload.championship.seededIds, ...payload.championship.unassignedIds]
  if (!sameStringSet(validChamp, payloadChamp)) return { ok: false, error: 'qualification_changed' }
  const champValidation = validateBranchSeedPayload(payload.championship, validChamp)
  if (!champValidation.ok) return { ok: false, error: 'invalid' }

  let consoSeeded: string[] = []
  if (consolationEnabled) {
    if (!payload.consolation || !Array.isArray(payload.consolation.seededIds)) return { ok: false, error: 'invalid' }
    const validConso = consoTokens.map((t) => t.tokenId)
    const payloadConso = [...payload.consolation.seededIds, ...payload.consolation.unassignedIds]
    if (!sameStringSet(validConso, payloadConso)) return { ok: false, error: 'qualification_changed' }
    const consoValidation = validateBranchSeedPayload(payload.consolation, validConso)
    if (!consoValidation.ok) return { ok: false, error: 'invalid' }
    consoSeeded = payload.consolation.seededIds
  } else if (payload.consolation && payload.consolation.seededIds.length > 0) {
    return { ok: false, error: 'invalid' }
  }

  // Serialize seeded tokens (both branches) into slot rows; the resolvedOrder above is only a preview.
  const slots: { bracket: string; slot_index: number; source_group_id: string; source_rank: number }[] = []
  const push = (bracket: Bracket, ids: string[]) => {
    ids.forEach((tokenId, i) => {
      const parsed = parseGroupRankTokenId(tokenId)
      if (parsed) slots.push({ bracket, slot_index: i, source_group_id: parsed.groupId, source_rank: parsed.rank })
    })
  }
  push('championship', payload.championship.seededIds)
  if (consolationEnabled) push('consolation', consoSeeded)

  const { data, error } = await admin.rpc('tournament_save_group_knockout_seeds', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_slots: slots,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_knockout_seeds_updated',
    detail: {
      championship_count: payload.championship.seededIds.length,
      consolation_count: consoSeeded.length,
    },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Clear all group-rank seeds ─────────────────────────────────────────────────────────────────
export async function clearGroupKnockoutSeeds(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }
  // Same fix as save: only an existing KNOCKOUT bracket blocks clearing seeds, not group matches.
  if (await hasKnockoutMatches(admin, eventId)) return { ok: false, error: 'has_matches' }

  const { data, error } = await admin.rpc('tournament_clear_group_knockout_seeds', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_knockout_seeds_updated',
    detail: { cleared: true },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Generate BOTH brackets (idempotent, atomic) ─────────────────────────────────────────────────
export async function generateGroupKnockoutBrackets(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  // Recompute standings/qualification from DB truth and require knockout_ready.
  const raw = await loadGroupEvalRaw(admin, eventId)
  const { qualificationByGroup, status } = evaluateGkStage(
    raw,
    ev.winnerQualifiersPerGroup,
    ev.consolationQualifiersPerGroup,
    await getEventGroupTablePoints(eventId),
  )
  if (status !== 'knockout_ready') return { ok: false, error: 'not_ready' }

  const { championship: champTokens, consolation: consoTokens } = buildGroupRankTokens({
    groups: raw.groupIds.map((id) => ({ groupId: id, competitorCount: (raw.competitorsByGroup.get(id) ?? []).length })),
    winnerQualifiers: ev.winnerQualifiersPerGroup,
    consolationQualifiers: ev.consolationQualifiersPerGroup,
  })
  const consolationEnabled = ev.consolationQualifiersPerGroup > 0

  // Re-load the persisted seed order per branch (never trust the client for order).
  const { data: slotRows } = await admin
    .from('tournament_knockout_seed_slots')
    .select('bracket, slot_index, source_group_id, source_rank')
    .eq('event_id', eventId)
    .eq('source_type', 'group_rank')
    .order('slot_index', { ascending: true })
  const seededByBranch = new Map<Bracket, string[]>([
    ['championship', []],
    ['consolation', []],
  ])
  for (const s of (slotRows as { bracket: string; slot_index: number; source_group_id: string | null; source_rank: number | null }[] | null) ?? []) {
    if (!s.source_group_id || s.source_rank == null) continue
    seededByBranch.get(s.bracket as Bracket)?.push(`group:${s.source_group_id}:rank:${s.source_rank}`)
  }

  type BranchRow = {
    bracket: string
    generation_key: string
    round_number: number
    match_number: number
    competitor_a_id: string | null
    competitor_b_id: string | null
    status: string
    winner_id: string | null
    source_a_key: string | null
    source_a_outcome: string | null
    source_b_key: string | null
    source_b_outcome: string | null
  }
  type BranchBuild =
    | { ok: false; error: KnockoutMutationError }
    | { ok: true; rows: BranchRow[] }

  // Each branch must be a full permutation of its valid tokens, all seeded (readiness).
  const buildBranchRows = (bracket: Bracket, tokenIds: string[], seeded: string[]): BranchBuild => {
    const permutation = validateBranchSeedPayload({ seededIds: seeded, unassignedIds: [] }, tokenIds)
    if (!permutation.ok) return { ok: false, error: 'not_ready' }
    if (seeded.length !== tokenIds.length) return { ok: false, error: 'not_ready' }
    const readiness = evaluateBranchSeedReadiness({ seededIds: seeded, unassignedIds: [] })
    if (!readiness.ok) return { ok: false, error: 'not_ready' }
    const resolution = resolveBranchSeeds(seeded, {
      winnerQualifiers: ev.winnerQualifiersPerGroup,
      qualificationByGroup,
    })
    if (!resolution.ok) return { ok: false, error: 'qualification_changed' }
    const bracketModel = buildKnockoutBracketFromSeeds(resolution.competitorIds, ev.thirdPlaceEnabled, bracket)
    const rows: BranchRow[] = buildKnockoutMatchRows(bracketModel).map((m) => ({
      bracket: m.bracket,
      generation_key: m.generationKey,
      round_number: m.roundNumber,
      match_number: m.matchNumber,
      competitor_a_id: m.competitorAId,
      competitor_b_id: m.competitorBId,
      status: m.status,
      winner_id: m.winnerId,
      source_a_key: m.sourceAKey,
      source_a_outcome: m.sourceAOutcome,
      source_b_key: m.sourceBKey,
      source_b_outcome: m.sourceBOutcome,
    }))
    return { ok: true, rows }
  }

  const champBuilt = buildBranchRows('championship', champTokens.map((t) => t.tokenId), seededByBranch.get('championship') ?? [])
  if (!champBuilt.ok) return { ok: false, error: champBuilt.error }
  let matchRows = champBuilt.rows

  if (consolationEnabled) {
    const consoBuilt = buildBranchRows('consolation', consoTokens.map((t) => t.tokenId), seededByBranch.get('consolation') ?? [])
    if (!consoBuilt.ok) return { ok: false, error: consoBuilt.error }
    matchRows = matchRows.concat(consoBuilt.rows)
  }

  const { data, error } = await admin.rpc('tournament_generate_group_knockout', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_matches: matchRows,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; match_count?: number } | null
  const code = result?.code
  if (code === 'already_generated') {
    return { ok: true, alreadyGenerated: true, matchCount: result?.match_count ?? 0 }
  }
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_knockout_generated',
    detail: {
      match_count: result?.match_count ?? matchRows.length,
      consolation: consolationEnabled,
    },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true, matchCount: result?.match_count ?? matchRows.length }
}

// ── Reset BOTH brackets (only when there are no results) ────────────────────────────────────────
export async function resetGroupKnockoutBrackets(
  tournamentId: string,
  eventId: string,
  expectedVersion: number,
  confirm: boolean,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'bracket.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !Number.isInteger(expectedVersion) || confirm !== true) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  const { data, error } = await admin.rpc('tournament_reset_group_knockout', {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: 'group_knockout_reset',
    detail: {},
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Save (create / update) a branch match result ─────────────────────────────────────────────────
export async function saveGroupKnockoutMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
  games: ScoreGameInput[],
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }
  if (!Array.isArray(games)) return { ok: false, error: 'invalid' }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(matchId)
  if (!match) return { ok: false, error: 'not_found' }
  if ((match.status !== 'ready' && match.status !== 'completed') || !match.competitorAId || !match.competitorBId) {
    return { ok: false, error: 'not_scoreable' }
  }
  const bracket = match.bracket as Bracket

  // Championship AND consolation branch matches both use the snapshot's knockout rules (or the legacy
  // engine when there is no snapshot). Winner derived here — never trusted from the client.
  const resolved = await resolveMatchScore({
    eventId,
    competitorAId: match.competitorAId,
    competitorBId: match.competitorBId,
    stage: { stage: 'knockout', bracket: match.bracket, status: match.status },
    games,
  })
  if (!resolved.ok) {
    return resolved.gameNumber
      ? { ok: false, error: resolved.error, gameNumber: resolved.gameNumber }
      : { ok: false, error: resolved.error }
  }
  const scored = resolved.value
  const loserId = scored.loserId

  // Progression is branch-isolated: reconstruct ONLY the match's own bracket (each branch has its own
  // third-place match, and reconstructBracketForProgression models a single third-place slot).
  const branchBoard: KnockoutBoard = {
    records: board.records.filter((r) => r.bracket === bracket),
    byId: board.byId,
    keyToId: board.keyToId,
  }
  const dbBracket = reconstructBracketForProgression(toDbBracket(branchBoard))
  const progression = progressKnockout({
    bracket: dbBracket,
    completedMatchKey: match.generationKey,
    winnerId: scored.winnerId,
    loserId,
  })
  const patches = progression.patches
    .map((p) => {
      const targetId = board.keyToId.get(p.matchKey)
      return targetId ? { match_id: targetId, slot: p.slot, competitor_id: p.competitorId } : null
    })
    .filter((x): x is { match_id: string; slot: 'A' | 'B'; competitor_id: string } => x !== null)

  // Overlay the edit and compute THIS branch's podium (calculatePodium over this bracket's records).
  const post = await loadKnockoutMatches(admin, eventId)
  const editRec = post.byId.get(matchId)
  if (editRec) {
    editRec.status = 'completed'
    editRec.winnerId = scored.winnerId
  }
  for (const p of patches) {
    const t = post.byId.get(p.match_id)
    if (!t) continue
    if (p.slot === 'A') t.competitorAId = p.competitor_id
    else t.competitorBId = p.competitor_id
  }
  const branchRecords = post.records.filter((r) => r.bracket === bracket)
  const podium = computeBracketPodium(branchRecords)
  const branchPodiumPayload =
    podium.status === 'ready'
      ? podium.entries.map((e) => ({ rank: e.rank, competitor_id: e.competitorId, is_joint: e.isJoint }))
      : null

  const gamesPayload = toGamesPayload(scored)
  const { data, error } = await admin.rpc('tournament_save_group_knockout_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
    p_games: gamesPayload,
    p_winner_id: scored.winnerId,
    p_bracket: bracket,
    p_patches: patches,
    p_branch_podium: branchPodiumPayload,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: string; branch_completed?: boolean; event_completed?: boolean } | null
  if (result?.code !== 'ok') return { ok: false, error: mapKnockoutCode(result?.code) }

  const created = match.status !== 'completed'
  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: bracket === 'championship' ? 'championship_result_updated' : 'consolation_result_updated',
    detail: {
      match_id: matchId,
      created,
      winner_after: scored.winnerId,
      games_won: `${scored.gamesWonA}-${scored.gamesWonB}`,
      event_status_after: result.status ?? 'knockout_running',
      rule: scored.audit,
    },
  })
  if (patches.length > 0) {
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'group_knockout_progressed',
      detail: { match_id: matchId, bracket, advanced: patches.length },
    })
  }
  if (result.branch_completed) {
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'branch_podium_calculated',
      detail: { bracket, ranks: branchPodiumPayload?.length ?? 0 },
    })
  }
  if (result.event_completed) {
    await writeAudit(admin, {
      tournamentId,
      eventId,
      actorId,
      action: 'group_knockout_completed',
      detail: { match_id: matchId },
    })
  }
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ── Clear a branch match result ──────────────────────────────────────────────────────────────────
export async function clearGroupKnockoutMatchResult(
  tournamentId: string,
  eventId: string,
  matchId: string,
  expectedMatchVersion: number,
): Promise<KnockoutMutationResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Number.isInteger(expectedMatchVersion)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(matchId)
  if (!match) return { ok: false, error: 'not_found' }
  if (match.status !== 'completed') return { ok: false, error: 'not_scoreable' }
  const current = outcomeOf(match)
  if (!current) return { ok: false, error: 'not_scoreable' }

  // Reconstruct only the match's own branch (see saveGroupKnockoutMatchResult).
  const branchBoard: KnockoutBoard = {
    records: board.records.filter((r) => r.bracket === match.bracket),
    byId: board.byId,
    keyToId: board.keyToId,
  }
  const dbBracket = reconstructBracketForProgression(toDbBracket(branchBoard))
  const progression = progressKnockout({
    bracket: dbBracket,
    completedMatchKey: match.generationKey,
    winnerId: current.winnerId,
    loserId: current.loserId,
  })
  const clearSlots = progression.patches
    .map((p) => {
      const targetId = board.keyToId.get(p.matchKey)
      return targetId ? { match_id: targetId, slot: p.slot } : null
    })
    .filter((x): x is { match_id: string; slot: 'A' | 'B' } => x !== null)

  const { data, error } = await admin.rpc('tournament_clear_group_knockout_result', {
    p_match_id: matchId,
    p_event_id: eventId,
    p_expected_match_version: expectedMatchVersion,
    p_clear_slots: clearSlots,
  })
  if (error) return { ok: false, error: 'unknown' }
  const code = (data as { code?: string } | null)?.code
  if (code !== 'ok') return { ok: false, error: mapKnockoutCode(code) }

  await writeAudit(admin, {
    tournamentId,
    eventId,
    actorId,
    action: match.bracket === 'championship' ? 'championship_result_updated' : 'consolation_result_updated',
    detail: { match_id: matchId, cleared: true, cleared_slots: clearSlots.length },
  })
  revalidateEventViews(tournamentId, eventId)
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// KNOCKOUT DEPENDENCY-PATH CORRECTION (Prompt 11 — event format 'knockout' OR 'group_knockout')
// ══════════════════════════════════════════════════════════════════════════════════════════
// Correcting a completed upstream knockout result whose DOWNSTREAM is already completed is refused by
// the Prompt 08/09 result actions (downstream_has_results). Prompt 11 adds the controlled path:
//   • previewAffectedKnockoutPath — READ-ONLY. Reconstructs the dependency graph from DB truth
//     (analyzeKnockoutCorrection) and returns the precise impact (matches reset, scores deleted,
//     participants reset, podium/status change). No mutation.
//   • resetAffectedKnockoutPath — mutation, requires the typed confirmation RESET. Re-loads DB truth,
//     re-derives the graph (never trusts the client impact list or a stale preview), and applies the
//     whole reset + re-progression + podium/status recalculation ATOMICALLY via a service-role RPC
//     (upstream version guard). Only the dependency path is touched — independent branches, the other
//     bracket and the group stage are left intact.

// Per-match game counts for the event (one grouped read) → used to report "scores deleted".
async function loadKnockoutGameCounts(admin: SupabaseClient, eventId: string): Promise<Map<string, number>> {
  const { data } = await admin
    .from('tournament_match_games')
    .select('match_id, tournament_matches!inner(event_id, stage)')
    .eq('tournament_matches.event_id', eventId)
    .eq('tournament_matches.stage', 'knockout')
  const counts = new Map<string, number>()
  for (const row of (data as { match_id: string }[] | null) ?? []) {
    counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1)
  }
  return counts
}

function boardToImpactRecords(board: KnockoutBoard, gameCounts: Map<string, number>): ImpactMatchRecord[] {
  return board.records.map((r) => ({
    id: r.id,
    generationKey: r.generationKey,
    bracket: r.bracket,
    roundNumber: r.roundNumber,
    matchNumber: r.matchNumber,
    status: r.status,
    competitorAId: r.competitorAId,
    competitorBId: r.competitorBId,
    winnerId: r.winnerId,
    sourceMatchAId: r.sourceMatchAId,
    sourceMatchBId: r.sourceMatchBId,
    sourceOutcomeA: r.sourceOutcomeA,
    sourceOutcomeB: r.sourceOutcomeB,
    gameCount: gameCounts.get(r.id) ?? 0,
  }))
}

// A translation TOKEN for a knockout match's round, derived from bracket STRUCTURE (never a stored
// string): third-place = fed by two losers; otherwise distance from the bracket's last round.
function knockoutRoundToken(rec: KnockoutMatchRecord, branch: KnockoutMatchRecord[]): string {
  if (rec.sourceOutcomeA === 'loser' && rec.sourceOutcomeB === 'loser') return 'third_place'
  const maxRound = branch
    .filter((r) => !(r.sourceOutcomeA === 'loser' && r.sourceOutcomeB === 'loser'))
    .reduce((mx, r) => Math.max(mx, r.roundNumber), 0)
  const fromEnd = maxRound - rec.roundNumber
  if (fromEnd === 0) return 'final'
  if (fromEnd === 1) return 'semifinal'
  if (fromEnd === 2) return 'quarterfinal'
  if (fromEnd === 3) return 'round_of_16'
  return `round_${rec.roundNumber}`
}

// Load the event status + parent tournament slug (for public-route revalidation), proving IDOR-safe.
async function loadEventStatusAndSlug(
  admin: SupabaseClient,
  tournamentId: string,
  eventId: string,
): Promise<{ status: EventStatus; slug: string } | null> {
  const [{ data: ev }, { data: tour }] = await Promise.all([
    admin.from('tournament_events').select('status, tournament_id').eq('id', eventId).maybeSingle(),
    admin.from('tournaments').select('slug').eq('id', tournamentId).maybeSingle(),
  ])
  const e = ev as { status: EventStatus; tournament_id: string } | null
  const t = tour as { slug: string } | null
  if (!e || !t || e.tournament_id !== tournamentId) return null
  return { status: e.status, slug: t.slug }
}

function revalidatePublicViews(slug: string) {
  revalidatePath('/giai-dau')
  revalidatePath(`/giai-dau/${slug}`)
}

async function competitorNameMap(admin: SupabaseClient, eventId: string): Promise<Map<string, string>> {
  const { data } = await admin
    .from('tournament_competitors')
    .select('id, name, short_name')
    .eq('event_id', eventId)
  const map = new Map<string, string>()
  for (const c of (data as { id: string; name: string; short_name: string | null }[] | null) ?? []) {
    map.set(c.id, c.short_name || c.name)
  }
  return map
}

function mapImpactError(code: string): ImpactPreviewResult & { ok: false } {
  switch (code) {
    case 'unknown_match': return { ok: false, error: 'not_found' }
    case 'not_completed': return { ok: false, error: 'not_scoreable' }
    case 'not_a_pairing': return { ok: false, error: 'not_scoreable' }
    case 'winner_not_in_match': return { ok: false, error: 'invalid' }
    default: return { ok: false, error: 'unknown' }
  }
}

// ── Preview: what a correction would reset (READ-ONLY) ──────────────────────────────────────────
export async function previewAffectedKnockoutPath(
  tournamentId: string,
  eventId: string,
  matchId: string,
  games: ScoreGameInput[],
): Promise<ImpactPreviewResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (!tournamentId || !eventId || !matchId || !Array.isArray(games)) return { ok: false, error: 'invalid' }

  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout' && ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(matchId)
  if (!match) return { ok: false, error: 'not_found' }
  if (match.status !== 'completed' || !match.competitorAId || !match.competitorBId) {
    return { ok: false, error: 'not_scoreable' }
  }

  // The corrected score is judged against the SAME rule-aware runtime as a normal save.
  const resolved = await resolveMatchScore({
    eventId,
    competitorAId: match.competitorAId,
    competitorBId: match.competitorBId,
    stage: { stage: 'knockout', bracket: match.bracket, status: match.status },
    games,
  })
  if (!resolved.ok) {
    return resolved.gameNumber
      ? { ok: false, error: resolved.error, gameNumber: resolved.gameNumber }
      : { ok: false, error: resolved.error }
  }
  const scored = resolved.value

  const gameCounts = await loadKnockoutGameCounts(admin, eventId)
  const analysis = analyzeKnockoutCorrection({
    matches: boardToImpactRecords(board, gameCounts),
    upstreamMatchId: matchId,
    newWinnerId: scored.winnerId,
  })
  if (!analysis.ok) return mapImpactError(analysis.error.code)
  const im = analysis.impact

  const names = await competitorNameMap(admin, eventId)
  const meta = await loadEventStatusAndSlug(admin, tournamentId, eventId)
  const nameOf = (id: string | null) => (id ? names.get(id) ?? id : '')
  const branchRecords = board.records.filter((r) => r.bracket === im.bracket)

  const affected: ImpactAffectedMatchView[] = im.affected.map((a) => {
    const rec = board.byId.get(a.matchId)!
    return {
      matchId: a.matchId,
      bracket: a.bracket as Bracket,
      roundNumber: a.roundNumber,
      matchNumber: a.matchNumber,
      roundLabel: knockoutRoundToken(rec, branchRecords),
      willClearResult: a.willClearResult,
      gamesToDelete: a.gamesToDelete,
      participantNames: a.participantsToReset.map((id) => nameOf(id)),
    }
  })

  const requiresReset = im.winnerChanges && im.resultsToClear > 0
  const eventStatusFrom: EventStatus = meta?.status ?? 'knockout_running'
  const preview: KnockoutImpactPreview = {
    upstreamMatchId: matchId,
    upstreamMatchVersion: match.version,
    bracket: im.bracket as Bracket,
    roundLabel: knockoutRoundToken(match, branchRecords),
    competitorAName: nameOf(match.competitorAId),
    competitorBName: nameOf(match.competitorBId),
    currentWinnerName: nameOf(im.currentWinnerId),
    newWinnerName: nameOf(im.newWinnerId),
    winnerChanges: im.winnerChanges,
    requiresReset,
    affected,
    totalGamesToDelete: im.totalGamesToDelete,
    resultsToClear: im.resultsToClear,
    podiumWillClear: im.podiumWillClear,
    eventStatusFrom,
    eventStatusTo: requiresReset ? ('knockout_running' as EventStatus) : eventStatusFrom,
    branchesAffected: im.branchesAffected as Bracket[],
    branchesUnaffected: im.branchesUnaffected as Bracket[],
  }
  return { ok: true, preview }
}

// ── Reset the dependency path (requires typed confirmation RESET) ────────────────────────────────
export async function resetAffectedKnockoutPath(
  tournamentId: string,
  eventId: string,
  upstreamMatchId: string,
  upstreamMatchVersion: number,
  confirmation: string,
  games: ScoreGameInput[],
): Promise<ResetPathResult> {
  if (!(await may(tournamentId, 'score.manage'))) return { ok: false, error: 'forbidden' }
  if (confirmation !== 'RESET') return { ok: false, error: 'confirmation_required' }
  if (!tournamentId || !eventId || !upstreamMatchId || !Number.isInteger(upstreamMatchVersion) || !Array.isArray(games)) {
    return { ok: false, error: 'invalid' }
  }

  const actorId = await currentUserId()
  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }
  if (ev.format !== 'knockout' && ev.format !== 'group_knockout') return { ok: false, error: 'wrong_format' }

  // Re-load DB truth — the impact is ALWAYS re-derived server-side; the client preview is never trusted.
  const board = await loadKnockoutMatches(admin, eventId)
  const match = board.byId.get(upstreamMatchId)
  if (!match) return { ok: false, error: 'not_found' }
  if (match.status !== 'completed' || !match.competitorAId || !match.competitorBId) {
    return { ok: false, error: 'not_scoreable' }
  }
  // Block a preview that went stale: the upstream must still be at the version captured in the preview.
  if (match.version !== upstreamMatchVersion) return { ok: false, error: 'version_conflict' }

  // The corrected score is judged against the SAME rule-aware runtime as a normal save.
  const resolved = await resolveMatchScore({
    eventId,
    competitorAId: match.competitorAId,
    competitorBId: match.competitorBId,
    stage: { stage: 'knockout', bracket: match.bracket, status: match.status },
    games,
  })
  if (!resolved.ok) {
    return resolved.gameNumber
      ? { ok: false, error: resolved.error, gameNumber: resolved.gameNumber }
      : { ok: false, error: resolved.error }
  }
  const scored = resolved.value

  const gameCounts = await loadKnockoutGameCounts(admin, eventId)
  const analysis = analyzeKnockoutCorrection({
    matches: boardToImpactRecords(board, gameCounts),
    upstreamMatchId,
    newWinnerId: scored.winnerId,
  })
  if (!analysis.ok) {
    const mapped = mapImpactError(analysis.error.code)
    return { ok: false, error: mapped.error }
  }
  const im = analysis.impact
  if (!im.winnerChanges) return { ok: false, error: 'no_change' }

  const resetIds = im.affected.map((a) => a.matchId)
  const clearSlots = im.affected.flatMap((a) => a.clearSlots.map((s) => ({ match_id: s.matchId, slot: s.slot })))
  const patches = im.reprogress.map((p) => ({ match_id: p.matchId, slot: p.slot, competitor_id: p.competitorId }))
  const gamesPayload = toGamesPayload(scored)

  const { data, error } = await admin.rpc('tournament_reset_knockout_path', {
    p_upstream_match_id: upstreamMatchId,
    p_event_id: eventId,
    p_bracket: im.bracket,
    p_expected_match_version: upstreamMatchVersion,
    p_games: gamesPayload,
    p_winner_id: scored.winnerId,
    p_reset_ids: resetIds,
    p_clear_slots: clearSlots,
    p_patches: patches,
    p_podium: null,
  })
  if (error) return { ok: false, error: 'unknown' }
  const result = data as { code?: string; status?: EventStatus; completed?: boolean } | null
  if (result?.code !== 'ok') return { ok: false, error: mapKnockoutCode(result?.code) }

  // Audit the full chain of consequences (ids / counts / winner / status — never secrets).
  const auditBase = { tournamentId, eventId, actorId }
  await writeAudit(admin, {
    ...auditBase,
    action: 'knockout_dependency_reset',
    detail: {
      upstream_match_id: upstreamMatchId,
      bracket: im.bracket,
      reset_match_ids: resetIds,
      games_deleted: im.totalGamesToDelete,
    },
  })
  await writeAudit(admin, {
    ...auditBase,
    action: 'knockout_result_corrected',
    detail: { upstream_match_id: upstreamMatchId, winner_before: im.currentWinnerId, winner_after: im.newWinnerId },
  })
  if (im.resultsToClear > 0) {
    await writeAudit(admin, {
      ...auditBase,
      action: 'downstream_results_cleared',
      detail: { count: im.resultsToClear, match_ids: im.affected.filter((a) => a.willClearResult).map((a) => a.matchId) },
    })
  }
  if (im.podiumWillClear) {
    await writeAudit(admin, {
      ...auditBase,
      action: 'podium_invalidated',
      detail: { bracket: im.bracket },
    })
  }
  const completed = result.completed === true
  const newStatus = (result.status ?? 'knockout_running') as EventStatus
  await writeAudit(admin, {
    ...auditBase,
    action: completed ? 'event_completed' : 'event_reopened',
    detail: { status_before: 'completed', status_after: newStatus },
  })
  if (completed) {
    await writeAudit(admin, { ...auditBase, action: 'podium_recalculated', detail: { bracket: im.bracket } })
  }

  const meta = await loadEventStatusAndSlug(admin, tournamentId, eventId)
  revalidateEventViews(tournamentId, eventId)
  if (meta) revalidatePublicViews(meta.slug)
  return { ok: true, status: newStatus, completed }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLLED RULE CHANGE / RESET / REGENERATION (Prompt 15D-2)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The controlled path for changing an event's scoring rules AFTER a schedule/bracket has been
// generated (even after results). previewEventRuleChangeImpact is READ-ONLY; applyRuleChangeWithReset
// is the single atomic mutation (RPC tournament_apply_rule_change) that resets downstream data, updates
// the rule snapshot and optionally regenerates the round-robin schedule — all-or-nothing. Both re-derive
// the impact from freshly reloaded DB truth; the client preview / token is never trusted. Gated on
// rules.manage (Scorekeeper denied; Manager only within the tournament they own; cross-tournament 404).

const RULE_SNAPSHOT_COLS =
  'id, event_id, source, preset_key, preset_version, category, schema_version, snapshot_version, requires_configuration, version, payload'

interface RuleSnapshotRow {
  id: string
  event_id: string
  source: string
  preset_key: string | null
  preset_version: number | null
  category: string | null
  snapshot_version: number
  requires_configuration: boolean
  version: number
  payload: RuleSet
}

async function loadRuleSnapshotRow(admin: SupabaseClient, eventId: string): Promise<RuleSnapshotRow | null> {
  const { data } = await admin
    .from('tournament_event_rule_snapshots')
    .select(RULE_SNAPSHOT_COLS)
    .eq('event_id', eventId)
    .maybeSingle()
  return (data as RuleSnapshotRow | null) ?? null
}

type ImpactFormat = RuleChangeImpactInput['eventFormat']
const IMPACT_FORMATS: readonly ImpactFormat[] = ['round_robin', 'knockout', 'group_knockout']

// Reload every piece of DB truth the impact preview + token depend on, for one event. Counts only —
// never identities. The generation keys + per-match versions are the strongest concurrency signal.
async function loadRuleChangeImpactTruth(
  admin: SupabaseClient,
  ev: EventContext,
  snapshot: RuleSnapshotRow,
  proposedRules: RuleSet,
): Promise<RuleChangeImpactInput> {
  const [{ data: matches }, { data: statusRow }, { count: podiumCount }, { count: qualCount }, { count: groupCount }] =
    await Promise.all([
      admin.from('tournament_matches').select('id, version, stage, bracket, generation_key').eq('event_id', ev.id),
      admin.from('tournament_events').select('status').eq('id', ev.id).maybeSingle(),
      admin.from('tournament_podium').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      admin.from('tournament_qualification_overrides').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      admin.from('tournament_groups').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
    ])

  const rows =
    (matches as { id: string; version: number; stage: string; bracket: string | null; generation_key: string }[] | null) ?? []
  // Count scored games by the reloaded match ids (avoids a fragile embedded-filter query).
  let scoredGameCount = 0
  if (rows.length > 0) {
    const { count } = await admin
      .from('tournament_match_games')
      .select('*', { count: 'exact', head: true })
      .in('match_id', rows.map((m) => m.id))
    scoredGameCount = count ?? 0
  }
  const groupMatchCount = rows.filter((m) => m.stage === 'group').length
  const knockoutChampionshipMatchCount = rows.filter((m) => m.stage === 'knockout' && m.bracket === 'championship').length
  const knockoutConsolationMatchCount = rows.filter((m) => m.stage === 'knockout' && m.bracket === 'consolation').length
  const matchVersions = rows.map((m) => ({ id: m.id, version: m.version }))
  const generationKeys = Array.from(new Set(rows.map((m) => m.generation_key)))
  const format = (IMPACT_FORMATS.includes(ev.format as ImpactFormat) ? ev.format : 'round_robin') as ImpactFormat

  return {
    eventVersion: ev.version,
    eventStatus: (statusRow as { status: string } | null)?.status ?? 'setup',
    eventFormat: format,
    snapshotVersion: snapshot.version,
    snapshotId: snapshot.id,
    groupMatchCount,
    knockoutChampionshipMatchCount,
    knockoutConsolationMatchCount,
    scoredGameCount,
    completedMatchCount: ev.completedMatchCount,
    standingsGroupCount: groupCount ?? 0,
    qualificationOverrideCount: qualCount ?? 0,
    podiumRowCount: podiumCount ?? 0,
    matchVersions,
    generationKeys,
    proposedRules,
  }
}

// Rebuild the proposed rule set + validate it, preserving the current snapshot's provenance. Returns
// the domain snapshot (for snapshot_version / requires_configuration) alongside the raw rule set.
function buildProposedSnapshot(current: RuleSnapshotRow, fields: RuleChangeApplyInput['fields']) {
  const proposedRules = buildRuleSetFromEditorFields(fields, current.payload)
  const domain = createEventRuleSnapshot({
    rules: proposedRules,
    source: current.source === 'preset' ? 'preset' : 'custom',
    presetKey: current.preset_key,
    presetVersion: current.preset_version,
    category: current.category,
    snapshotVersion: current.snapshot_version + 1,
  })
  return { proposedRules, domain }
}

async function rulesManageActor(
  tournamentId: string,
): Promise<{ ok: true; actorId: string | null } | { ok: false; error: 'forbidden' | 'not_authenticated' }> {
  const check = await checkTournamentPermission(tournamentId, 'rules.manage')
  if (check.ok) return { ok: true, actorId: check.actorId }
  return { ok: false, error: check.error === 'NOT_AUTHENTICATED' ? 'not_authenticated' : 'forbidden' }
}

// ── Preview: what a rule change would reset (READ-ONLY, never mutates) ──────────────────────────
export async function previewEventRuleChangeImpact(
  tournamentId: string,
  eventId: string,
  fields: RuleChangeApplyInput['fields'],
): Promise<RuleChangePreviewResult> {
  const gate = await rulesManageActor(tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!tournamentId || !eventId || !fields) return { ok: false, error: 'invalid' }

  const admin = createAdminClient()
  const ev = await loadEvent(admin, tournamentId, eventId)
  if (!ev) return { ok: false, error: 'not_found' }

  const snapshot = await loadRuleSnapshotRow(admin, eventId)
  if (!snapshot) return { ok: false, error: 'snapshot_not_found' }

  const meta = await loadEventStatusAndSlug(admin, tournamentId, eventId)
  if (meta?.status === 'completed') return { ok: false, error: 'event_completed' }

  const { proposedRules, domain } = buildProposedSnapshot(snapshot, fields)
  const validation = validateEventRuleSnapshot(domain)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }

  const classification = classifyRuleChange(snapshot.payload, proposedRules)
  const guard = deriveRuleChangeGuard({ matchCount: ev.matchCount, completedMatchCount: ev.completedMatchCount }, classification)

  const impactInput = await loadRuleChangeImpactTruth(admin, ev, snapshot, proposedRules)
  const impactToken = computeRuleChangeImpactToken(impactInput)
  const summary = summarizeRuleChangeImpact(impactInput, guard.requiredResetScope)

  return {
    ok: true,
    preview: {
      snapshotId: snapshot.id,
      snapshotVersion: snapshot.version,
      eventVersion: ev.version,
      eventFormat: impactInput.eventFormat,
      classification,
      mode: guard.mode,
      requiredResetScope: guard.requiredResetScope,
      requiresDestructiveConfirmation: guard.requiresDestructiveConfirmation,
      summary,
      impactToken,
    },
  }
}

// ── Apply: reset downstream + update snapshot + regenerate — ONE atomic RPC ─────────────────────
export async function applyRuleChangeWithReset(input: RuleChangeApplyInput): Promise<RuleChangeApplyResult> {
  const gate = await rulesManageActor(input.tournamentId)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (
    !input.tournamentId || !input.eventId || !input.snapshotId || !input.fields ||
    !Number.isInteger(input.expectedSnapshotVersion) || !Number.isInteger(input.expectedEventVersion) ||
    !input.expectedImpactToken || (input.resetMode !== 'schedule_only' && input.resetMode !== 'all_results_and_downstream')
  ) {
    return { ok: false, error: 'invalid' }
  }

  const admin = createAdminClient()
  const ev = await loadEvent(admin, input.tournamentId, input.eventId)
  if (!ev) return { ok: false, error: 'not_found' }

  const snapshot = await loadRuleSnapshotRow(admin, input.eventId)
  if (!snapshot || snapshot.id !== input.snapshotId) return { ok: false, error: 'snapshot_not_found' }

  const meta = await loadEventStatusAndSlug(admin, input.tournamentId, input.eventId)
  if (meta?.status === 'completed') return { ok: false, error: 'event_completed' }

  const { proposedRules, domain } = buildProposedSnapshot(snapshot, input.fields)
  const validation = validateEventRuleSnapshot(domain)
  if (!validation.ok) return { ok: false, error: 'validation_failed', issues: validation.issues }
  if (domain.metadata.requires_configuration && !input.acknowledgeWarning) {
    return { ok: false, error: 'warning_not_acknowledged' }
  }

  const classification = classifyRuleChange(snapshot.payload, proposedRules)
  const guard = deriveRuleChangeGuard({ matchCount: ev.matchCount, completedMatchCount: ev.completedMatchCount }, classification)

  // Enforce the controlled guard server-side (never trust a client flag).
  if (guard.requiresDestructiveConfirmation && input.confirmation !== RULE_CHANGE_CONFIRM_PHRASE) {
    return { ok: false, error: 'confirmation_required' }
  }
  if (guard.requiredResetScope === 'all_results_and_downstream' && input.resetMode !== 'all_results_and_downstream') {
    return { ok: false, error: 'results_present' }
  }
  const eventFormat = (IMPACT_FORMATS.includes(ev.format as ImpactFormat) ? ev.format : 'round_robin') as ImpactFormat
  if (!applicableRegenerateModes(eventFormat).includes(input.regenerateMode)) {
    return { ok: false, error: 'invalid' }
  }

  // Re-derive the impact token from fresh truth; refuse if the preview went stale (data changed).
  const impactInput = await loadRuleChangeImpactTruth(admin, ev, snapshot, proposedRules)
  const freshToken = computeRuleChangeImpactToken(impactInput)
  if (freshToken !== input.expectedImpactToken) return { ok: false, error: 'rule_change_impact_stale' }

  // Build the round-robin regeneration payload when requested + applicable (§10 — knockout is never
  // auto-generated here). Not-ready group assignment → not_ready (never a partial regenerate).
  let regenMatches: Record<string, unknown>[] | null = null
  const wantsRoundRobin = input.regenerateMode === 'round_robin' || input.regenerateMode === 'all_applicable'
  if (wantsRoundRobin && (ev.format === 'round_robin' || ev.format === 'group_knockout')) {
    const state = await loadGroupState(admin, input.eventId)
    const rows = buildMatchRowsFromState(
      state,
      ev.format as GroupStageFormat,
      ev.winnerQualifiersPerGroup,
      ev.consolationQualifiersPerGroup,
    )
    if (rows === null) return { ok: false, error: 'not_ready' }
    regenMatches = rows
  }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_change_reset_started',
    detail: {
      reset_mode: input.resetMode,
      regenerate_mode: input.regenerateMode,
      severity: classification.severity,
      changed_paths: classification.changedPaths,
      snapshot_version_before: snapshot.snapshot_version,
      generation_keys_before: impactInput.generationKeys,
    },
  })

  const { data, error } = await admin.rpc('tournament_apply_rule_change', {
    p_event_id: input.eventId,
    p_tournament_id: input.tournamentId,
    p_snapshot_id: input.snapshotId,
    p_expected_snapshot_version: input.expectedSnapshotVersion,
    p_expected_event_version: input.expectedEventVersion,
    p_new_payload: proposedRules,
    p_new_snapshot_version: domain.metadata.snapshot_version,
    p_requires_configuration: domain.metadata.requires_configuration,
    p_reset_mode: input.resetMode,
    p_regenerate_mode: input.regenerateMode,
    p_regen_matches: regenMatches,
    p_confirm: input.confirmation === RULE_CHANGE_CONFIRM_PHRASE,
  })

  const result = data as
    | { code?: string; status?: string; snapshot_version?: number; regenerated?: boolean; reset?: Record<string, number> }
    | null
  if (error || !result || result.code !== 'ok') {
    await writeAudit(admin, {
      tournamentId: input.tournamentId,
      eventId: input.eventId,
      actorId: gate.actorId,
      action: 'event_rule_change_failed',
      detail: { code: error ? 'rpc_error' : result?.code ?? 'unknown', reset_mode: input.resetMode },
    })
    switch (result?.code) {
      case 'snapshot_version_conflict':
        return { ok: false, error: 'snapshot_version_conflict' }
      case 'event_version_conflict':
        return { ok: false, error: 'event_version_conflict' }
      case 'results_present':
        return { ok: false, error: 'results_present' }
      case 'confirmation_required':
        return { ok: false, error: 'confirmation_required' }
      case 'event_completed':
        return { ok: false, error: 'event_completed' }
      case 'snapshot_not_found':
        return { ok: false, error: 'snapshot_not_found' }
      case 'not_found':
        return { ok: false, error: 'not_found' }
      default:
        return { ok: false, error: 'unknown' }
    }
  }

  await writeAudit(admin, {
    tournamentId: input.tournamentId,
    eventId: input.eventId,
    actorId: gate.actorId,
    action: 'event_rule_change_applied',
    detail: {
      reset_mode: input.resetMode,
      snapshot_version_after: result.snapshot_version ?? domain.metadata.snapshot_version,
      reset: result.reset ?? {},
      status_after: result.status ?? 'setup',
    },
  })
  if (result.regenerated) {
    await writeAudit(admin, {
      tournamentId: input.tournamentId,
      eventId: input.eventId,
      actorId: gate.actorId,
      action: 'event_schedule_regenerated',
      detail: { match_count: regenMatches?.length ?? 0, generation_keys_after: (regenMatches ?? []).map((m) => m.generation_key) },
    })
  }

  revalidateEventViews(input.tournamentId, input.eventId)
  if (meta) revalidatePublicViews(meta.slug)
  return {
    ok: true,
    snapshotVersion: result.snapshot_version ?? domain.metadata.snapshot_version,
    status: result.status ?? 'setup',
    regenerated: result.regenerated === true,
  }
}
