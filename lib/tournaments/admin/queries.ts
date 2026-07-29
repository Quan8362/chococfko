import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CompetitorRow,
  EventDetail,
  EventListItem,
  EventStatus,
  GroupRow,
  GroupStandingsView,
  GroupSetup,
  KnockoutMatchView,
  KnockoutRoundView,
  KnockoutSeedSetup,
  KnockoutWorkspace,
  MatchGameView,
  MatchView,
  PodiumRowView,
  ScheduleMatch,
  ScoringWorkspace,
  StandingRowView,
  TieGroupView,
  TournamentDetail,
  TournamentListItem,
  TournamentStatus,
  TournamentStatusFilter,
  GroupRankTokenView,
  BranchSeedState,
  BranchWorkspace,
  GroupKnockoutBlockReason,
  GroupKnockoutSeedSetup,
  GroupKnockoutWorkspace,
} from './types'
import type { EventFormat } from '@/lib/tournaments/eventValidation'
import { evaluateGroupStage, type GroupEvaluationInput } from '@/lib/tournaments/domain/event-progress'
import type { GroupStageFormat } from '@/lib/tournaments/domain/group-assignment'
import { requiredBracketSize, knockoutByeCount } from '@/lib/tournaments/domain/knockout-seed'
import {
  buildGroupRankTokens,
  resolveGroupRankToken,
  type GroupRankToken,
} from '@/lib/tournaments/domain/group-knockout-seed'
import type { Competitor, MatchInput, Bracket } from '@/lib/tournaments/domain/types'
import type { QualificationOutcome } from '@/lib/tournaments/domain/qualification'

// Shape of a row as returned by the service-role SELECT. The embedded `tournament_events(count)`
// aggregate is what keeps the list a SINGLE query (no per-tournament count fan-out / N+1).
interface RawListRow {
  id: string
  slug: string
  name: string
  status: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  updated_at: string
  tournament_events: { count: number }[] | null
}

interface RawDetailRow extends RawListRow {
  rules_url: string | null
  created_at: string
}

function embeddedCount(rows: { count: number }[] | null | undefined): number {
  return Array.isArray(rows) && rows.length > 0 ? rows[0]?.count ?? 0 : 0
}

/**
 * List tournaments for the admin table. One query, newest-updated first, optionally filtered by
 * status. Uses service-role (RLS-bypassing) so drafts/archived are visible to the admin. Callers
 * MUST have passed checkIsAdmin() upstream (the /admin layout + page both guard).
 */
export async function listTournamentsForAdmin(
  filter: TournamentStatusFilter,
): Promise<TournamentListItem[]> {
  const admin = createAdminClient()
  let query = admin
    .from('tournaments')
    .select('id, slug, name, status, starts_at, ends_at, location, updated_at, tournament_events(count)')
    .order('updated_at', { ascending: false })

  if (filter !== 'all') query = query.eq('status', filter)

  const { data, error } = await query
  if (error || !data) return []

  return (data as RawListRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status as TournamentStatus,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    location: r.location,
    eventCount: embeddedCount(r.tournament_events),
    updatedAt: r.updated_at,
  }))
}

/** Fetch a single tournament (any status) with its event count, for the admin detail/edit views. */
export async function getTournamentForAdmin(id: string): Promise<TournamentDetail | null> {
  if (!id) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tournaments')
    .select(
      'id, slug, name, status, starts_at, ends_at, location, rules_url, created_at, updated_at, tournament_events(count)',
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  const r = data as RawDetailRow
  const eventCount = embeddedCount(r.tournament_events)
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status as TournamentStatus,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    location: r.location,
    rulesUrl: r.rules_url,
    eventCount,
    // Every child row (competitors/groups/matches/…) hangs off an event, so "has data" == has events.
    hasChildren: eventCount > 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ── Events (nội dung thi đấu) ───────────────────────────────────────────────────────────────

interface RawEventRow {
  id: string
  name: string
  format: string
  status: string
  group_count: number
  winner_qualifiers_per_group: number
  consolation_qualifiers_per_group: number
  third_place_enabled: boolean
  display_order: number
  version: number
  tournament_competitors: { count: number }[] | null
}

function mapEventRow(r: RawEventRow): EventListItem {
  return {
    id: r.id,
    name: r.name,
    format: r.format as EventFormat,
    status: r.status as EventStatus,
    groupCount: r.group_count,
    winnerQualifiersPerGroup: r.winner_qualifiers_per_group,
    consolationQualifiersPerGroup: r.consolation_qualifiers_per_group,
    thirdPlaceEnabled: r.third_place_enabled,
    displayOrder: r.display_order,
    competitorCount: embeddedCount(r.tournament_competitors),
    version: r.version,
  }
}

/**
 * List a tournament's events for the admin detail view. One query, ordered by display_order, with
 * each event's competitor count embedded (no per-event fan-out / N+1). Service-role → visible at
 * any tournament status. Callers MUST have passed checkIsAdmin() upstream.
 */
export async function listEventsForAdmin(tournamentId: string): Promise<EventListItem[]> {
  if (!tournamentId) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tournament_events')
    .select(
      'id, name, format, status, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, third_place_enabled, display_order, version, tournament_competitors(count)',
    )
    .eq('tournament_id', tournamentId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return (data as unknown as RawEventRow[]).map(mapEventRow)
}

interface RawEventDetailRow extends RawEventRow {
  tournament_id: string
  tournaments: { name: string; status: string } | null
}

interface RawCompetitorRow {
  id: string
  name: string
  short_name: string | null
  seed: number | null
  display_order: number
  updated_at: string
}

function mapCompetitorRow(r: RawCompetitorRow): CompetitorRow {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    seed: r.seed,
    displayOrder: r.display_order,
    updatedAt: r.updated_at,
  }
}

/**
 * Fetch one event (verifying it belongs to `tournamentId`) with its settings, its parent
 * tournament's name/status, match counts, and the full competitor roster. Returns null when the
 * event does not exist OR belongs to a different tournament (anti-IDOR at the read layer too).
 */
export async function getEventForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<EventDetail | null> {
  if (!tournamentId || !eventId) return null
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('tournament_events')
    .select(
      'id, tournament_id, name, format, status, group_count, winner_qualifiers_per_group, ' +
        'consolation_qualifiers_per_group, third_place_enabled, display_order, version, ' +
        'tournament_competitors(count), tournaments(name, status)',
    )
    .eq('id', eventId)
    .maybeSingle()

  if (error || !data) return null
  const r = data as unknown as RawEventDetailRow
  if (r.tournament_id !== tournamentId) return null

  const [{ data: comps }, { count: matchCount }, { count: completedCount }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id, name, short_name, seed, display_order, updated_at')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId),
    admin
      .from('tournament_matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'completed'),
  ])

  return {
    id: r.id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournaments?.name ?? '',
    tournamentStatus: (r.tournaments?.status ?? 'draft') as TournamentStatus,
    name: r.name,
    format: r.format as EventFormat,
    status: r.status as EventStatus,
    groupCount: r.group_count,
    winnerQualifiersPerGroup: r.winner_qualifiers_per_group,
    consolationQualifiersPerGroup: r.consolation_qualifiers_per_group,
    thirdPlaceEnabled: r.third_place_enabled,
    displayOrder: r.display_order,
    version: r.version,
    competitorCount: embeddedCount(r.tournament_competitors),
    matchCount: matchCount ?? 0,
    completedMatchCount: completedCount ?? 0,
    competitors: ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow),
  }
}

// ── Group setup (Prompt 06) ─────────────────────────────────────────────────────────────────

interface RawGroupRow {
  id: string
  name: string
  display_order: number
}

interface RawMembershipRow {
  group_id: string
  competitor_id: string
  display_order: number
}

interface RawScheduleRow {
  id: string
  group_id: string | null
  round_number: number
  match_number: number
  competitor_a_id: string | null
  competitor_b_id: string | null
  status: string
  stage: string
}

/**
 * Load everything the event group-stage workspace needs in one place: the event's group-relevant
 * settings, the full competitor roster, the groups, current memberships (→ per-group ordered ids +
 * the unassigned remainder), and any already-generated group matches. Verifies the event belongs
 * to `tournamentId` (anti-IDOR at the read layer). Service-role — callers MUST have passed
 * checkIsAdmin() upstream. Returns null when the event is missing, on another tournament, or is a
 * knockout event (groups do not apply to knockout).
 */
export async function getGroupSetupForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<GroupSetup | null> {
  if (!tournamentId || !eventId) return null
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('tournament_events')
    .select(
      'id, tournament_id, format, status, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, version',
    )
    .eq('id', eventId)
    .maybeSingle()
  const event = ev as unknown as {
    id: string
    tournament_id: string
    format: string
    status: string
    group_count: number
    winner_qualifiers_per_group: number
    consolation_qualifiers_per_group: number
    version: number
  } | null
  if (!event || event.tournament_id !== tournamentId) return null
  if (event.format === 'knockout') return null

  const [{ data: comps }, { data: groupRows }, { data: memberRows }, { data: matchRows }] =
    await Promise.all([
      admin
        .from('tournament_competitors')
        .select('id, name, short_name, seed, display_order, updated_at')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      admin
        .from('tournament_groups')
        .select('id, name, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_group_memberships')
        .select('group_id, competitor_id, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_matches')
        .select('id, group_id, round_number, match_number, competitor_a_id, competitor_b_id, status, stage')
        .eq('event_id', eventId)
        .order('group_id', { ascending: true })
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true }),
    ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const groups: GroupRow[] = ((groupRows as RawGroupRow[] | null) ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    displayOrder: g.display_order,
  }))

  const memberships: Record<string, string[]> = {}
  for (const g of groups) memberships[g.id] = []
  const placed = new Set<string>()
  for (const m of (memberRows as RawMembershipRow[] | null) ?? []) {
    if (memberships[m.group_id]) {
      memberships[m.group_id].push(m.competitor_id)
      placed.add(m.competitor_id)
    }
  }
  const unassignedIds = competitors.filter((c) => !placed.has(c.id)).map((c) => c.id)

  const allMatches = (matchRows as RawScheduleRow[] | null) ?? []
  const groupMatches = allMatches.filter((m) => m.stage === 'group')
  const schedule: ScheduleMatch[] = groupMatches.map((m) => ({
    id: m.id,
    groupId: m.group_id,
    roundNumber: m.round_number,
    matchNumber: m.match_number,
    competitorAId: m.competitor_a_id,
    competitorBId: m.competitor_b_id,
    status: m.status,
  }))

  // hasScores backstops "regenerate only when there are no results": a single existence probe over
  // the group matches' games (limit 1 — not a per-row loop).
  let hasScores = false
  if (groupMatches.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id')
      .in('match_id', groupMatches.map((m) => m.id))
      .limit(1)
    hasScores = Array.isArray(gameRows) && gameRows.length > 0
  }

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format: event.format as EventFormat,
      status: event.status as EventStatus,
      groupCount: event.group_count,
      winnerQualifiersPerGroup: event.winner_qualifiers_per_group,
      consolationQualifiersPerGroup: event.consolation_qualifiers_per_group,
      version: event.version,
    },
    competitors,
    groups,
    memberships,
    unassignedIds,
    schedule,
    matchCount: groupMatches.length,
    completedMatchCount: groupMatches.filter((m) => m.status === 'completed').length,
    hasKnockoutMatches: allMatches.some((m) => m.stage === 'knockout'),
    hasScores,
  }
}

// ── Scoring workspace (Prompt 07) ───────────────────────────────────────────────────────────

interface RawScoreMatchRow {
  id: string
  group_id: string | null
  round_number: number
  match_number: number
  competitor_a_id: string | null
  competitor_b_id: string | null
  status: string
  stage: string
  version: number
  winner_competitor_id: string | null
  updated_at: string | null
}

// Derive per-side games-won and total points from a match's recorded games (display only; the
// authoritative winner is stored on the match and re-derivable via the pure engine).
function tallyGames(games: MatchGameView[]): {
  gamesWonA: number
  gamesWonB: number
  pointsForA: number
  pointsForB: number
} {
  let gamesWonA = 0
  let gamesWonB = 0
  let pointsForA = 0
  let pointsForB = 0
  for (const g of games) {
    pointsForA += g.scoreA
    pointsForB += g.scoreB
    if (g.scoreA > g.scoreB) gamesWonA += 1
    else if (g.scoreB > g.scoreA) gamesWonB += 1
  }
  return { gamesWonA, gamesWonB, pointsForA, pointsForB }
}

/**
 * Load one group-format event's full scoring workspace: its group matches (with per-game scores),
 * the roster, groups, and the pure-engine evaluation of every group (standings + tie classification
 * + qualification preview) plus the derived event status. Verifies the event belongs to
 * `tournamentId` and is NOT a knockout event (anti-IDOR + format gate). Service-role — callers MUST
 * have passed checkIsAdmin() upstream. Returns null when the event is missing / on another
 * tournament / is knockout / has no groups yet.
 */
export async function getScoringWorkspaceForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<ScoringWorkspace | null> {
  if (!tournamentId || !eventId) return null
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('tournament_events')
    .select(
      'id, tournament_id, format, status, winner_qualifiers_per_group, consolation_qualifiers_per_group, version',
    )
    .eq('id', eventId)
    .maybeSingle()
  const event = ev as unknown as {
    id: string
    tournament_id: string
    format: string
    status: string
    winner_qualifiers_per_group: number
    consolation_qualifiers_per_group: number
    version: number
  } | null
  if (!event || event.tournament_id !== tournamentId) return null
  if (event.format === 'knockout') return null

  const [{ data: comps }, { data: groupRows }, { data: memberRows }, { data: matchRows }, { data: overrideRows }] =
    await Promise.all([
      admin
        .from('tournament_competitors')
        .select('id, name, short_name, seed, display_order, updated_at')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      admin
        .from('tournament_groups')
        .select('id, name, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_group_memberships')
        .select('group_id, competitor_id, display_order')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true }),
      admin
        .from('tournament_matches')
        .select(
          'id, group_id, round_number, match_number, competitor_a_id, competitor_b_id, status, stage, version, winner_competitor_id, updated_at',
        )
        .eq('event_id', eventId)
        .order('group_id', { ascending: true })
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true }),
      admin
        .from('tournament_qualification_overrides')
        .select('group_id, resolved_order, reason')
        .eq('event_id', eventId),
    ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const nameById = new Map(competitors.map((c) => [c.id, c.name]))
  const groups: GroupRow[] = ((groupRows as RawGroupRow[] | null) ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    displayOrder: g.display_order,
  }))
  if (groups.length === 0) return null

  // group → ordered competitor ids
  const groupMembers: Record<string, string[]> = {}
  for (const g of groups) groupMembers[g.id] = []
  for (const m of (memberRows as RawMembershipRow[] | null) ?? []) {
    if (groupMembers[m.group_id]) groupMembers[m.group_id].push(m.competitor_id)
  }

  const allMatches = (matchRows as RawScoreMatchRow[] | null) ?? []
  const groupMatchRows = allMatches.filter((m) => m.stage === 'group')
  const hasKnockout = allMatches.some((m) => m.stage === 'knockout')

  // Games for the group matches (one query).
  const gamesByMatch = new Map<string, MatchGameView[]>()
  if (groupMatchRows.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id, game_number, score_a, score_b')
      .in('match_id', groupMatchRows.map((m) => m.id))
      .order('game_number', { ascending: true })
    for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
      const list = gamesByMatch.get(g.match_id)
      const view: MatchGameView = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
      if (list) list.push(view)
      else gamesByMatch.set(g.match_id, [view])
    }
  }

  const matches: MatchView[] = groupMatchRows.map((m) => {
    const games = gamesByMatch.get(m.id) ?? []
    const tally = tallyGames(games)
    return {
      id: m.id,
      groupId: m.group_id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      competitorAId: m.competitor_a_id,
      competitorBId: m.competitor_b_id,
      status: m.status,
      version: m.version,
      winnerId: m.winner_competitor_id,
      games,
      gamesWonA: tally.gamesWonA,
      gamesWonB: tally.gamesWonB,
      pointsForA: tally.pointsForA,
      pointsForB: tally.pointsForB,
      updatedAt: m.updated_at,
    }
  })

  const overridesByGroup = new Map<string, { order: string[]; reason: string | null }>()
  for (const o of (overrideRows as { group_id: string; resolved_order: unknown; reason: string | null }[] | null) ?? []) {
    const order = Array.isArray(o.resolved_order) ? (o.resolved_order as string[]) : []
    overridesByGroup.set(o.group_id, { order, reason: o.reason })
  }

  // Build the pure-engine evaluation input (per group: its roster + its matches + any override).
  const matchesByGroup = new Map<string, MatchInput[]>()
  for (const m of matches) {
    if (!m.groupId) continue
    const mi: MatchInput = {
      competitorAId: m.competitorAId,
      competitorBId: m.competitorBId,
      status: m.status as MatchInput['status'],
      games: m.games.map((g) => ({ gameNumber: g.gameNumber, scoreA: g.scoreA, scoreB: g.scoreB })),
      winnerId: m.winnerId,
    }
    const list = matchesByGroup.get(m.groupId)
    if (list) list.push(mi)
    else matchesByGroup.set(m.groupId, [mi])
  }

  const format = event.format as GroupStageFormat
  const groupInputs: GroupEvaluationInput[] = groups.map((g) => ({
    groupId: g.id,
    competitors: (groupMembers[g.id] ?? []).map((id): Competitor => ({ id, name: nameById.get(id) ?? id })),
    matches: matchesByGroup.get(g.id) ?? [],
    resolvedOrder: overridesByGroup.get(g.id)?.order,
  }))

  const evaluation = evaluateGroupStage({
    format,
    winnerQualifiers: event.winner_qualifiers_per_group,
    consolationQualifiers: event.consolation_qualifiers_per_group,
    groups: groupInputs,
  })

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]))
  const standings: GroupStandingsView[] = evaluation.groups.map((g) => {
    const ov = overridesByGroup.get(g.groupId)
    const champ = new Set(g.qualification.status === 'ok' ? g.qualification.championship : [])
    const conso = new Set(g.qualification.status === 'ok' ? g.qualification.consolation : [])
    const rows: StandingRowView[] = g.standings.rows.map((r) => {
      let qualification: StandingRowView['qualification']
      if (format !== 'group_knockout') qualification = 'none'
      else if (g.qualification.status === 'ok') {
        qualification = champ.has(r.competitorId)
          ? 'championship'
          : conso.has(r.competitorId)
            ? 'consolation'
            : 'none'
      } else qualification = 'undetermined'
      return {
        competitorId: r.competitorId,
        position: r.position,
        rank: r.rank,
        played: r.played,
        wins: r.wins,
        losses: r.losses,
        tablePoints: r.tablePoints,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        pointDifference: r.pointDifference,
        tied: r.tied,
        qualification,
      }
    })
    const ties: TieGroupView[] = g.ties.map((t) => ({
      competitorIds: [...t.competitorIds],
      rank: t.rank,
      positionStart: t.positionStart,
      positionEnd: t.positionEnd,
      impact: t.impact,
    }))
    return {
      groupId: g.groupId,
      groupName: groupNameById.get(g.groupId) ?? g.groupId,
      rows,
      ties,
      blockingTies: ties.filter((t) => t.impact !== 'none'),
      allCompleted: g.allCompleted,
      qualificationStatus:
        format !== 'group_knockout' ? 'n/a' : (g.qualification.status as 'ok' | 'blocked_by_tie' | 'invalid'),
      hasOverride: g.hasOverride,
      overrideReason: ov?.reason ?? null,
    }
  })

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format,
      status: event.status as EventStatus,
      winnerQualifiersPerGroup: event.winner_qualifiers_per_group,
      consolationQualifiersPerGroup: event.consolation_qualifiers_per_group,
      version: event.version,
    },
    competitors,
    groups,
    matches,
    standings,
    computedStatus: evaluation.status as EventStatus,
    allCompleted: evaluation.allCompleted,
    hasBlockingTie: evaluation.hasBlockingTie,
    hasKnockout,
  }
}

// ── Knockout seeding + workspace (Prompt 08) ──────────────────────────────────────────────────

interface RawKnockoutEventRow {
  id: string
  tournament_id: string
  format: string
  status: string
  third_place_enabled: boolean
  version: number
}

async function loadKnockoutEvent(
  tournamentId: string,
  eventId: string,
): Promise<RawKnockoutEventRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tournament_events')
    .select('id, tournament_id, format, status, third_place_enabled, version')
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as unknown as RawKnockoutEventRow | null
  if (!ev || ev.tournament_id !== tournamentId || ev.format !== 'knockout') return null
  return ev
}

/**
 * Load the knockout seed-editor state: the roster, the currently seeded competitors (in slot order)
 * + the unassigned remainder, and the derived bracket size / bye count. Verifies the event belongs
 * to `tournamentId` and is a knockout event (anti-IDOR + format gate). Service-role — callers MUST
 * have passed checkIsAdmin() upstream. Returns null when the event is missing / on another
 * tournament / is not knockout.
 */
export async function getKnockoutSeedSetupForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<KnockoutSeedSetup | null> {
  if (!tournamentId || !eventId) return null
  const event = await loadKnockoutEvent(tournamentId, eventId)
  if (!event) return null
  const admin = createAdminClient()

  const [{ data: comps }, { data: slotRows }, { data: bracketProbe }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id, name, short_name, seed, display_order, updated_at')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_knockout_seed_slots')
      .select('slot_index, competitor_id, source_type')
      .eq('event_id', eventId)
      .eq('bracket', 'championship')
      .order('slot_index', { ascending: true }),
    // Existence probe (limit 1 — not a per-row count fan-out): has the bracket been generated?
    admin.from('tournament_matches').select('id').eq('event_id', eventId).eq('stage', 'knockout').limit(1),
  ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const known = new Set(competitors.map((c) => c.id))
  const seededIds: string[] = []
  const seen = new Set<string>()
  for (const s of (slotRows as { slot_index: number; competitor_id: string | null; source_type: string }[] | null) ?? []) {
    if (s.source_type === 'competitor' && s.competitor_id && known.has(s.competitor_id) && !seen.has(s.competitor_id)) {
      seededIds.push(s.competitor_id)
      seen.add(s.competitor_id)
    }
  }
  const unassignedIds = competitors.filter((c) => !seen.has(c.id)).map((c) => c.id)

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format: event.format as EventFormat,
      status: event.status as EventStatus,
      thirdPlaceEnabled: event.third_place_enabled,
      version: event.version,
    },
    competitors,
    seededIds,
    unassignedIds,
    bracketSize: requiredBracketSize(seededIds.length),
    byes: knockoutByeCount(seededIds.length),
    hasBracket: Array.isArray(bracketProbe) && bracketProbe.length > 0,
  }
}

interface RawKnockoutMatchRow {
  id: string
  round_number: number
  match_number: number
  competitor_a_id: string | null
  competitor_b_id: string | null
  status: string
  version: number
  winner_competitor_id: string | null
  source_match_a_id: string | null
  source_match_b_id: string | null
  source_outcome_a: string | null
  source_outcome_b: string | null
  generation_key: string
}

// A knockout round label mirroring the pure engine, derived from the match count in the round.
function knockoutRoundLabel(matchesInRound: number, roundNumber: number): string {
  switch (matchesInRound) {
    case 1: return 'final'
    case 2: return 'semifinal'
    case 4: return 'quarterfinal'
    case 8: return 'round_of_16'
    default: return `round_${roundNumber}`
  }
}

/**
 * Load one knockout event's full workspace: the bracket rounds (with per-game scores), the roster,
 * and the persisted podium; plus derived flags (has the bracket been generated, are there results,
 * is it complete). The final / third-place matches are identified STRUCTURALLY (the third-place
 * match is fed by two losers; the final is the terminal non-third match). Verifies the event belongs
 * to `tournamentId` and is a knockout event. Service-role — callers MUST have passed checkIsAdmin()
 * upstream. Returns null when the event is missing / on another tournament / is not knockout.
 */
export async function getKnockoutWorkspaceForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<KnockoutWorkspace | null> {
  if (!tournamentId || !eventId) return null
  const event = await loadKnockoutEvent(tournamentId, eventId)
  if (!event) return null
  const admin = createAdminClient()

  const [{ data: comps }, { data: matchRows }, { data: podiumRows }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id, name, short_name, seed, display_order, updated_at')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_matches')
      .select(
        'id, round_number, match_number, competitor_a_id, competitor_b_id, status, version, ' +
          'winner_competitor_id, source_match_a_id, source_match_b_id, source_outcome_a, source_outcome_b, generation_key',
      )
      .eq('event_id', eventId)
      .eq('stage', 'knockout')
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true }),
    admin
      .from('tournament_podium')
      .select('rank, competitor_id, is_joint')
      .eq('event_id', eventId)
      .eq('bracket', 'championship')
      .order('rank', { ascending: true }),
  ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const rows = (matchRows as RawKnockoutMatchRow[] | null) ?? []

  // Games for the knockout matches (one query).
  const gamesByMatch = new Map<string, MatchGameView[]>()
  if (rows.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id, game_number, score_a, score_b')
      .in('match_id', rows.map((m) => m.id))
      .order('game_number', { ascending: true })
    for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
      const list = gamesByMatch.get(g.match_id)
      const view: MatchGameView = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
      if (list) list.push(view)
      else gamesByMatch.set(g.match_id, [view])
    }
  }

  // Structural identification of the third-place (two-loser-fed) and final (terminal non-third) match.
  const referenced = new Set<string>()
  for (const m of rows) {
    if (m.source_match_a_id) referenced.add(m.source_match_a_id)
    if (m.source_match_b_id) referenced.add(m.source_match_b_id)
  }
  const thirdPlaceId = rows.find((m) => m.source_outcome_a === 'loser' && m.source_outcome_b === 'loser')?.id ?? null
  let finalId: string | null = null
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue
    if (referenced.has(m.id)) continue // has a downstream → not terminal
    finalId = m.id // terminal non-third match
  }

  const tally = (games: MatchGameView[]) => {
    let a = 0
    let b = 0
    for (const g of games) {
      if (g.scoreA > g.scoreB) a += 1
      else if (g.scoreB > g.scoreA) b += 1
    }
    return { a, b }
  }

  // Group into rounds; the round label follows the match count in that round.
  const byRound = new Map<number, RawKnockoutMatchRow[]>()
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue // rendered separately
    const list = byRound.get(m.round_number)
    if (list) list.push(m)
    else byRound.set(m.round_number, [m])
  }

  const toView = (m: RawKnockoutMatchRow): KnockoutMatchView => {
    const games = gamesByMatch.get(m.id) ?? []
    const t = tally(games)
    return {
      id: m.id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      roundLabel: m.id === thirdPlaceId ? 'third_place' : knockoutRoundLabel(byRound.get(m.round_number)?.length ?? 1, m.round_number),
      competitorAId: m.competitor_a_id,
      competitorBId: m.competitor_b_id,
      status: m.status,
      version: m.version,
      winnerId: m.winner_competitor_id,
      games,
      gamesWonA: t.a,
      gamesWonB: t.b,
      isFinal: m.id === finalId,
      isThirdPlace: m.id === thirdPlaceId,
    }
  }

  const rounds: KnockoutRoundView[] = Array.from(byRound.keys())
    .sort((x, y) => x - y)
    .map((roundNumber) => {
      const list = byRound.get(roundNumber)!
      return {
        roundNumber,
        label: knockoutRoundLabel(list.length, roundNumber),
        matches: list.map(toView),
      }
    })

  const thirdRow = rows.find((m) => m.id === thirdPlaceId) ?? null
  const thirdPlaceMatch = thirdRow ? toView(thirdRow) : null

  const podium: PodiumRowView[] = ((podiumRows as { rank: number; competitor_id: string; is_joint: boolean }[] | null) ?? []).map((p) => ({
    rank: p.rank as 1 | 2 | 3,
    competitorId: p.competitor_id,
    isJoint: p.is_joint,
  }))

  const finalRow = rows.find((m) => m.id === finalId) ?? null
  const finalDone = finalRow?.status === 'completed'
  const thirdDone = !thirdRow || thirdRow.status === 'completed'
  const hasGames = gamesByMatch.size > 0
  const hasResults = rows.some((m) => m.status === 'completed') || hasGames || podium.length > 0

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format: event.format as EventFormat,
      status: event.status as EventStatus,
      thirdPlaceEnabled: event.third_place_enabled,
      version: event.version,
    },
    competitors,
    rounds,
    thirdPlaceMatch,
    podium,
    hasBracket: rows.length > 0,
    hasResults,
    isComplete: !!finalRow && finalDone && thirdDone,
  }
}

// ── Group + knockout: tokens, seed setup & dual-bracket workspace (Prompt 09) ──────────────────

interface RawGkEventRow {
  id: string
  tournament_id: string
  format: string
  status: string
  third_place_enabled: boolean
  winner_qualifiers_per_group: number
  consolation_qualifiers_per_group: number
  version: number
}

async function loadGroupKnockoutEvent(
  tournamentId: string,
  eventId: string,
): Promise<RawGkEventRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tournament_events')
    .select(
      'id, tournament_id, format, status, third_place_enabled, winner_qualifiers_per_group, consolation_qualifiers_per_group, version',
    )
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as unknown as RawGkEventRow | null
  if (!ev || ev.tournament_id !== tournamentId || ev.format !== 'group_knockout') return null
  return ev
}

// Recompute the whole group stage (standings + qualification) from DB truth — the same evaluation the
// scoring workspace uses — so token resolution & readiness always reflect the CURRENT results.
async function evaluateGroupStageForEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: RawGkEventRow,
): Promise<{
  groups: GroupRow[]
  competitors: CompetitorRow[]
  qualificationByGroup: Map<string, QualificationOutcome>
  status: string
}> {
  const eventId = event.id
  const [{ data: comps }, { data: groupRows }, { data: memberRows }, { data: matchRows }, { data: overrideRows }] =
    await Promise.all([
      admin
        .from('tournament_competitors')
        .select('id, name, short_name, seed, display_order, updated_at')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      admin
        .from('tournament_groups')
        .select('id, name, display_order')
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
        .eq('event_id', eventId)
        .eq('stage', 'group'),
      admin
        .from('tournament_qualification_overrides')
        .select('group_id, resolved_order')
        .eq('event_id', eventId),
    ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const nameById = new Map(competitors.map((c) => [c.id, c.name]))
  const groups: GroupRow[] = ((groupRows as RawGroupRow[] | null) ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    displayOrder: g.display_order,
  }))

  const groupMembers = new Map<string, string[]>()
  for (const g of groups) groupMembers.set(g.id, [])
  for (const m of (memberRows as RawMembershipRow[] | null) ?? []) {
    groupMembers.get(m.group_id)?.push(m.competitor_id)
  }

  const groupMatchRows = (matchRows as {
    id: string
    group_id: string | null
    status: string
    competitor_a_id: string | null
    competitor_b_id: string | null
    winner_competitor_id: string | null
  }[] | null) ?? []

  const gamesByMatch = new Map<string, { gameNumber: number; scoreA: number; scoreB: number }[]>()
  if (groupMatchRows.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id, game_number, score_a, score_b')
      .in('match_id', groupMatchRows.map((m) => m.id))
      .order('game_number', { ascending: true })
    for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
      const list = gamesByMatch.get(g.match_id)
      const view = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
      if (list) list.push(view)
      else gamesByMatch.set(g.match_id, [view])
    }
  }

  const matchesByGroup = new Map<string, MatchInput[]>()
  for (const m of groupMatchRows) {
    if (!m.group_id) continue
    const mi: MatchInput = {
      competitorAId: m.competitor_a_id,
      competitorBId: m.competitor_b_id,
      status: m.status as MatchInput['status'],
      games: gamesByMatch.get(m.id) ?? [],
      winnerId: m.winner_competitor_id,
    }
    const list = matchesByGroup.get(m.group_id)
    if (list) list.push(mi)
    else matchesByGroup.set(m.group_id, [mi])
  }

  const overridesByGroup = new Map<string, string[]>()
  for (const o of (overrideRows as { group_id: string; resolved_order: unknown }[] | null) ?? []) {
    if (Array.isArray(o.resolved_order)) overridesByGroup.set(o.group_id, o.resolved_order as string[])
  }

  const groupInputs: GroupEvaluationInput[] = groups.map((g) => ({
    groupId: g.id,
    competitors: (groupMembers.get(g.id) ?? []).map((id): Competitor => ({ id, name: nameById.get(id) ?? id })),
    matches: matchesByGroup.get(g.id) ?? [],
    resolvedOrder: overridesByGroup.get(g.id),
  }))

  const evaluation = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: event.winner_qualifiers_per_group,
    consolationQualifiers: event.consolation_qualifiers_per_group,
    groups: groupInputs,
  })

  const qualificationByGroup = new Map<string, QualificationOutcome>()
  for (const g of evaluation.groups) qualificationByGroup.set(g.groupId, g.qualification)

  return { groups, competitors, qualificationByGroup, status: evaluation.status }
}

// Build one branch's seed state: its valid tokens (resolved to a preview competitor), the currently
// seeded token order + unassigned remainder, and the derived bracket size / bye count.
function buildBranchSeedState(
  bracket: Bracket,
  enabled: boolean,
  tokens: readonly GroupRankToken[],
  groupNameById: Map<string, string>,
  qualificationByGroup: Map<string, QualificationOutcome>,
  winnerQualifiers: number,
  seededOrder: string[],
): BranchSeedState {
  const tokenViews: GroupRankTokenView[] = tokens.map((t) => {
    const res = resolveGroupRankToken(
      { groupId: t.groupId, rank: t.rank },
      { winnerQualifiers, qualificationByGroup },
    )
    return {
      tokenId: t.tokenId,
      groupId: t.groupId,
      groupName: groupNameById.get(t.groupId) ?? t.groupId,
      rank: t.rank,
      branch: bracket,
      competitorId: res.ok ? res.competitorId : null,
      resolvable: res.ok,
    }
  })
  const validIds = new Set(tokens.map((t) => t.tokenId))
  const seededIds = seededOrder.filter((id) => validIds.has(id))
  const seen = new Set(seededIds)
  const unassignedIds = tokens.map((t) => t.tokenId).filter((id) => !seen.has(id))
  return {
    bracket,
    enabled,
    tokens: tokenViews,
    seededIds,
    unassignedIds,
    bracketSize: requiredBracketSize(seededIds.length),
    byes: knockoutByeCount(seededIds.length),
  }
}

/**
 * Load the dual-branch seed editor state for a group_knockout event: the roster + groups, the valid
 * group-rank tokens for each branch (with a resolved competitor preview from the CURRENT standings),
 * the currently seeded order per branch, and whether the event is ready to seed (knockout_ready).
 * Verifies event ↔ tournament + format='group_knockout'. Service-role — callers MUST have passed
 * checkIsAdmin() upstream. Returns null when the event is missing / on another tournament / not
 * group_knockout.
 */
export async function getGroupKnockoutSeedSetupForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<GroupKnockoutSeedSetup | null> {
  if (!tournamentId || !eventId) return null
  const event = await loadGroupKnockoutEvent(tournamentId, eventId)
  if (!event) return null
  const admin = createAdminClient()

  const [{ groups, competitors, qualificationByGroup, status }, { data: slotRows }, { data: bracketProbe }] =
    await Promise.all([
      evaluateGroupStageForEvent(admin, event),
      admin
        .from('tournament_knockout_seed_slots')
        .select('bracket, slot_index, source_group_id, source_rank, source_type')
        .eq('event_id', eventId)
        .eq('source_type', 'group_rank')
        .order('bracket', { ascending: true })
        .order('slot_index', { ascending: true }),
      admin.from('tournament_matches').select('id').eq('event_id', eventId).eq('stage', 'knockout').limit(1),
    ])

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]))
  const { championship: champTokens, consolation: consoTokens } = buildGroupRankTokens({
    groups: groups.map((g) => ({ groupId: g.id })),
    winnerQualifiers: event.winner_qualifiers_per_group,
    consolationQualifiers: event.consolation_qualifiers_per_group,
  })

  // Current seeded order per branch, reconstructed from the persisted group-rank slots.
  const seededByBranch = new Map<Bracket, string[]>([
    ['championship', []],
    ['consolation', []],
  ])
  for (const s of (slotRows as { bracket: string; slot_index: number; source_group_id: string | null; source_rank: number | null }[] | null) ?? []) {
    if (!s.source_group_id || s.source_rank == null) continue
    const list = seededByBranch.get(s.bracket as Bracket)
    if (list) list.push(`group:${s.source_group_id}:rank:${s.source_rank}`)
  }

  const consolationEnabled = event.consolation_qualifiers_per_group > 0
  const championship = buildBranchSeedState(
    'championship',
    true,
    champTokens,
    groupNameById,
    qualificationByGroup,
    event.winner_qualifiers_per_group,
    seededByBranch.get('championship') ?? [],
  )
  const consolation = consolationEnabled
    ? buildBranchSeedState(
        'consolation',
        true,
        consoTokens,
        groupNameById,
        qualificationByGroup,
        event.winner_qualifiers_per_group,
        seededByBranch.get('consolation') ?? [],
      )
    : null

  let blockReason: GroupKnockoutBlockReason | null = null
  if (status === 'group_stage') blockReason = 'group_stage_incomplete'
  else if (status === 'group_stage_completed') blockReason = 'blocking_tie'
  else if (status !== 'knockout_ready' && status !== 'knockout_running' && status !== 'completed') {
    blockReason = 'not_ready'
  }

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format: event.format as EventFormat,
      status: event.status as EventStatus,
      thirdPlaceEnabled: event.third_place_enabled,
      winnerQualifiersPerGroup: event.winner_qualifiers_per_group,
      consolationQualifiersPerGroup: event.consolation_qualifiers_per_group,
      version: event.version,
    },
    competitors,
    groups,
    championship,
    consolation,
    readyToSeed: status === 'knockout_ready',
    blockReason,
    hasBrackets: Array.isArray(bracketProbe) && bracketProbe.length > 0,
  }
}

// Build one branch's live workspace (rounds + third-place + podium + status) from the matches of that
// bracket. Mirrors getKnockoutWorkspaceForAdmin but scoped to a single bracket subset.
function buildBranchWorkspace(
  bracket: Bracket,
  rows: RawKnockoutMatchRow[],
  gamesByMatch: Map<string, MatchGameView[]>,
  podiumRows: { rank: number; competitor_id: string; is_joint: boolean }[],
): BranchWorkspace {
  const referenced = new Set<string>()
  for (const m of rows) {
    if (m.source_match_a_id) referenced.add(m.source_match_a_id)
    if (m.source_match_b_id) referenced.add(m.source_match_b_id)
  }
  const thirdPlaceId = rows.find((m) => m.source_outcome_a === 'loser' && m.source_outcome_b === 'loser')?.id ?? null
  let finalId: string | null = null
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue
    if (referenced.has(m.id)) continue
    finalId = m.id
  }

  const tally = (games: MatchGameView[]) => {
    let a = 0
    let b = 0
    for (const g of games) {
      if (g.scoreA > g.scoreB) a += 1
      else if (g.scoreB > g.scoreA) b += 1
    }
    return { a, b }
  }

  const byRound = new Map<number, RawKnockoutMatchRow[]>()
  for (const m of rows) {
    if (m.id === thirdPlaceId) continue
    const list = byRound.get(m.round_number)
    if (list) list.push(m)
    else byRound.set(m.round_number, [m])
  }

  const toView = (m: RawKnockoutMatchRow): KnockoutMatchView => {
    const games = gamesByMatch.get(m.id) ?? []
    const t = tally(games)
    return {
      id: m.id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      roundLabel: m.id === thirdPlaceId ? 'third_place' : knockoutRoundLabel(byRound.get(m.round_number)?.length ?? 1, m.round_number),
      competitorAId: m.competitor_a_id,
      competitorBId: m.competitor_b_id,
      status: m.status,
      version: m.version,
      winnerId: m.winner_competitor_id,
      games,
      gamesWonA: t.a,
      gamesWonB: t.b,
      isFinal: m.id === finalId,
      isThirdPlace: m.id === thirdPlaceId,
    }
  }

  const rounds: KnockoutRoundView[] = Array.from(byRound.keys())
    .sort((x, y) => x - y)
    .map((roundNumber) => {
      const list = byRound.get(roundNumber)!
      return { roundNumber, label: knockoutRoundLabel(list.length, roundNumber), matches: list.map(toView) }
    })

  const thirdRow = rows.find((m) => m.id === thirdPlaceId) ?? null
  const thirdPlaceMatch = thirdRow ? toView(thirdRow) : null

  const podium: PodiumRowView[] = podiumRows.map((p) => ({
    rank: p.rank as 1 | 2 | 3,
    competitorId: p.competitor_id,
    isJoint: p.is_joint,
  }))

  const finalRow = rows.find((m) => m.id === finalId) ?? null
  const finalDone = finalRow?.status === 'completed'
  const thirdDone = !thirdRow || thirdRow.status === 'completed'
  const hasGames = rows.some((m) => (gamesByMatch.get(m.id)?.length ?? 0) > 0)
  const hasResults = rows.some((m) => m.status === 'completed') || hasGames || podium.length > 0

  return {
    bracket,
    rounds,
    thirdPlaceMatch,
    podium,
    hasBracket: rows.length > 0,
    hasResults,
    isComplete: !!finalRow && finalDone && thirdDone,
  }
}

/**
 * Load a group_knockout event's dual-bracket workspace: both brackets' rounds (with per-game scores),
 * the roster, and each branch's persisted podium; plus derived flags per branch and for the event.
 * The final / third-place matches are identified STRUCTURALLY within each bracket. Verifies event ↔
 * tournament + format='group_knockout'. Service-role — callers MUST have passed checkIsAdmin()
 * upstream. Returns null when the event is missing / on another tournament / not group_knockout.
 */
export async function getGroupKnockoutWorkspaceForAdmin(
  tournamentId: string,
  eventId: string,
): Promise<GroupKnockoutWorkspace | null> {
  if (!tournamentId || !eventId) return null
  const event = await loadGroupKnockoutEvent(tournamentId, eventId)
  if (!event) return null
  const admin = createAdminClient()

  const [{ data: comps }, { data: matchRows }, { data: podiumRows }] = await Promise.all([
    admin
      .from('tournament_competitors')
      .select('id, name, short_name, seed, display_order, updated_at')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('tournament_matches')
      .select(
        'id, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, version, ' +
          'winner_competitor_id, source_match_a_id, source_match_b_id, source_outcome_a, source_outcome_b, generation_key',
      )
      .eq('event_id', eventId)
      .eq('stage', 'knockout')
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true }),
    admin
      .from('tournament_podium')
      .select('bracket, rank, competitor_id, is_joint')
      .eq('event_id', eventId)
      .order('rank', { ascending: true }),
  ])

  const competitors = ((comps as RawCompetitorRow[] | null) ?? []).map(mapCompetitorRow)
  const allRows = (matchRows as (RawKnockoutMatchRow & { bracket: string })[] | null) ?? []
  const champRows = allRows.filter((m) => m.bracket === 'championship')
  const consoRows = allRows.filter((m) => m.bracket === 'consolation')

  const gamesByMatch = new Map<string, MatchGameView[]>()
  if (allRows.length > 0) {
    const { data: gameRows } = await admin
      .from('tournament_match_games')
      .select('match_id, game_number, score_a, score_b')
      .in('match_id', allRows.map((m) => m.id))
      .order('game_number', { ascending: true })
    for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
      const list = gamesByMatch.get(g.match_id)
      const view: MatchGameView = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
      if (list) list.push(view)
      else gamesByMatch.set(g.match_id, [view])
    }
  }

  const podium = (podiumRows as { bracket: string; rank: number; competitor_id: string; is_joint: boolean }[] | null) ?? []
  const champ = buildBranchWorkspace('championship', champRows, gamesByMatch, podium.filter((p) => p.bracket === 'championship'))
  const consolationExists = consoRows.length > 0
  const conso = consolationExists
    ? buildBranchWorkspace('consolation', consoRows, gamesByMatch, podium.filter((p) => p.bracket === 'consolation'))
    : null

  const eventComplete = champ.hasBracket && champ.isComplete && (!consolationExists || (conso?.isComplete ?? false))

  return {
    event: {
      id: event.id,
      tournamentId: event.tournament_id,
      format: event.format as EventFormat,
      status: event.status as EventStatus,
      thirdPlaceEnabled: event.third_place_enabled,
      version: event.version,
    },
    competitors,
    championship: champ,
    consolation: conso,
    hasBrackets: allRows.length > 0,
    hasResults: champ.hasResults || (conso?.hasResults ?? false),
    isComplete: eventComplete,
  }
}
