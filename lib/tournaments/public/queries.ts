import 'server-only'

import { createPublicClient } from '@/lib/supabase/public'
import { toPublicEventRuleSummary, type PublicEventRuleSummary, type RawPublicRuleSummaryRow } from '@/lib/tournaments/rules'
import { evaluateGroupStage, type GroupEvaluationInput } from '@/lib/tournaments/domain/event-progress'
import type { GroupStageFormat } from '@/lib/tournaments/domain/group-assignment'
import { buildBracketRounds, type BracketMatchRef } from '@/lib/tournaments/domain/bracket-view'
import { tournamentPhase } from './format'
import type { Competitor, MatchInput } from '@/lib/tournaments/domain/types'
import type { EventFormat } from '@/lib/tournaments/eventValidation'
import type {
  KnockoutMatchView,
  KnockoutRoundView,
  PodiumRowView,
} from '@/lib/tournaments/admin/types'
import type {
  PublicBracket,
  PublicCompetitor,
  PublicEventSummary,
  PublicEventWorkspace,
  PublicGroupStandings,
  PublicScheduleGame,
  PublicScheduleMatch,
  PublicStandingRow,
  PublicTournamentListItem,
  PublicTournamentStatus,
  PublicTournamentSummary,
  TournamentPhase,
} from './types'

// SECURITY MODEL (do not weaken):
// - Every read here uses the ANON, cookie-free `createPublicClient()` and is subject to RLS. RLS
//   only exposes tournaments whose status is 'published' | 'completed' and their child rows, so a
//   draft/archived tournament simply returns zero rows → the caller renders a 404 without ever
//   confirming the draft exists.
// - We NEVER use the service-role admin client here, never read the audit log, and never trust a
//   tournament/event id straight from the URL: an event is only surfaced if it belongs to the
//   public tournament resolved from the slug (cross-tournament access is blocked).
// - No raw SQL / Postgres errors are propagated to the browser — on any failure we return
//   null / [] and let the page render its empty/404 state.

const PUBLIC_STATUSES: PublicTournamentStatus[] = ['published', 'completed']

function embeddedCount(rows: { count: number }[] | null | undefined): number {
  return Array.isArray(rows) && rows.length > 0 ? rows[0]?.count ?? 0 : 0
}

const PHASE_RANK: Record<TournamentPhase, number> = { ongoing: 0, upcoming: 1, completed: 2 }

interface RawPublicListRow {
  slug: string
  name: string
  status: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  tournament_events: { count: number }[] | null
}

/**
 * List all publicly visible tournaments (published + completed) for the `/giai-dau` index. ONE
 * query (event count embedded — no N+1). Ordered ongoing → upcoming → completed; within each bucket,
 * ongoing/upcoming by soonest start, completed by most recent start.
 */
export async function listPublicTournaments(): Promise<PublicTournamentListItem[]> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('tournaments')
      .select('slug, name, status, starts_at, ends_at, location, tournament_events(count)')
      .in('status', PUBLIC_STATUSES)
    if (error || !data) return []

    const items: PublicTournamentListItem[] = (data as RawPublicListRow[]).map((r) => {
      const status = r.status as PublicTournamentStatus
      return {
        slug: r.slug,
        name: r.name,
        status,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        location: r.location,
        eventCount: embeddedCount(r.tournament_events),
        phase: tournamentPhase(status, r.starts_at, r.ends_at),
      }
    })

    items.sort((a, b) => {
      if (PHASE_RANK[a.phase] !== PHASE_RANK[b.phase]) return PHASE_RANK[a.phase] - PHASE_RANK[b.phase]
      const at = a.startsAt ? Date.parse(a.startsAt) : NaN
      const bt = b.startsAt ? Date.parse(b.startsAt) : NaN
      if (Number.isNaN(at) && Number.isNaN(bt)) return a.name.localeCompare(b.name)
      if (Number.isNaN(at)) return 1
      if (Number.isNaN(bt)) return -1
      // completed: newest first; ongoing/upcoming: soonest first.
      return a.phase === 'completed' ? bt - at : at - bt
    })
    return items
  } catch {
    return []
  }
}

interface RawEventSummaryRow {
  id: string
  name: string
  format: string
  status: string
  group_count: number
  winner_qualifiers_per_group: number
  consolation_qualifiers_per_group: number
  third_place_enabled: boolean
  display_order: number
  tournament_competitors: { count: number }[] | null
}

/**
 * Fetch one public tournament (published/completed only) by slug, with its events. Returns null for
 * a missing/draft/archived slug (RLS makes those invisible → no draft is ever confirmed). No N+1:
 * the events come in one query and their match/completed-match counts from a single matches query.
 */
export async function getPublicTournamentBySlug(slug: string): Promise<PublicTournamentSummary | null> {
  if (!slug) return null
  try {
    const supabase = createPublicClient()
    const { data: t, error } = await supabase
      .from('tournaments')
      .select('id, slug, name, status, starts_at, ends_at, location, rules_url')
      .eq('slug', slug)
      .in('status', PUBLIC_STATUSES)
      .maybeSingle()
    if (error || !t) return null
    const tournament = t as {
      id: string
      slug: string
      name: string
      status: string
      starts_at: string | null
      ends_at: string | null
      location: string | null
      rules_url: string | null
    }

    const { data: eventRows } = await supabase
      .from('tournament_events')
      .select(
        'id, name, format, status, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, third_place_enabled, display_order, tournament_competitors(count)',
      )
      .eq('tournament_id', tournament.id)
      .order('display_order', { ascending: true })

    const rawEvents = (eventRows as RawEventSummaryRow[] | null) ?? []
    const eventIds = rawEvents.map((e) => e.id)

    // Single matches query for the whole tournament → per-event total/completed counts (no per-event fan-out).
    const matchTotals = new Map<string, number>()
    const matchDone = new Map<string, number>()
    if (eventIds.length > 0) {
      const { data: matchRows } = await supabase
        .from('tournament_matches')
        .select('event_id, status')
        .in('event_id', eventIds)
      for (const m of (matchRows as { event_id: string; status: string }[] | null) ?? []) {
        matchTotals.set(m.event_id, (matchTotals.get(m.event_id) ?? 0) + 1)
        if (m.status === 'completed' || m.status === 'bye') {
          matchDone.set(m.event_id, (matchDone.get(m.event_id) ?? 0) + 1)
        }
      }
    }

    const events: PublicEventSummary[] = rawEvents.map((e) => ({
      id: e.id,
      name: e.name,
      format: e.format as EventFormat,
      status: e.status,
      groupCount: e.group_count,
      winnerQualifiersPerGroup: e.winner_qualifiers_per_group,
      consolationQualifiersPerGroup: e.consolation_qualifiers_per_group,
      thirdPlaceEnabled: e.third_place_enabled,
      displayOrder: e.display_order,
      competitorCount: embeddedCount(e.tournament_competitors),
      matchCount: matchTotals.get(e.id) ?? 0,
      completedMatchCount: matchDone.get(e.id) ?? 0,
    }))

    return {
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      status: tournament.status as PublicTournamentStatus,
      startsAt: tournament.starts_at,
      endsAt: tournament.ends_at,
      location: tournament.location,
      rulesUrl: tournament.rules_url,
      events,
    }
  } catch {
    return null
  }
}

interface RawCompetitorRow {
  id: string
  name: string
  short_name: string | null
  seed: number | null
  display_order: number
}

interface RawMatchRow {
  id: string
  group_id: string | null
  stage: string
  bracket: string | null
  round_number: number
  match_number: number
  competitor_a_id: string | null
  competitor_b_id: string | null
  status: string
  winner_competitor_id: string | null
  source_match_a_id: string | null
  source_match_b_id: string | null
  source_outcome_a: string | null
  source_outcome_b: string | null
}

// A knockout match row in the camelCase shape the structural helper (BracketMatchRef) and the
// KnockoutMatchView builder both consume.
interface KoRow extends BracketMatchRef {
  matchNumber: number
  bracket: 'championship' | 'consolation'
  competitorAId: string | null
  competitorBId: string | null
  status: string
  winnerId: string | null
}

function tally(games: PublicScheduleGame[]): { a: number; b: number; pointsA: number; pointsB: number } {
  let a = 0
  let b = 0
  let pointsA = 0
  let pointsB = 0
  for (const g of games) {
    pointsA += g.scoreA
    pointsB += g.scoreB
    if (g.scoreA > g.scoreB) a += 1
    else if (g.scoreB > g.scoreA) b += 1
  }
  return { a, b, pointsA, pointsB }
}

/**
 * Load one public event's full read-only workspace (overview stats, competitors, schedule + results,
 * standings, knockout bracket(s) & podium) — everything the detail tabs render, in one server load.
 *
 * Anti-IDOR: the event is only returned if it belongs to the public tournament resolved from `slug`
 * (a valid eventId from another tournament, or from a draft, yields null). Reuses the SAME pure
 * domain composition as the admin workspace (`evaluateGroupStage` for standings/qualification,
 * `buildBracketRounds` for bracket structure) — no algorithm is re-implemented here or in React.
 */
export async function getPublicEventWorkspace(
  slug: string,
  eventId: string,
): Promise<PublicEventWorkspace | null> {
  if (!slug || !eventId) return null
  try {
    const supabase = createPublicClient()

    const { data: t } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .in('status', PUBLIC_STATUSES)
      .maybeSingle()
    const tournamentId = (t as { id: string } | null)?.id
    if (!tournamentId) return null

    const { data: ev } = await supabase
      .from('tournament_events')
      .select(
        'id, tournament_id, name, format, status, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, third_place_enabled, display_order',
      )
      .eq('id', eventId)
      .maybeSingle()
    const event = ev as {
      id: string
      tournament_id: string
      name: string
      format: string
      status: string
      group_count: number
      winner_qualifiers_per_group: number
      consolation_qualifiers_per_group: number
      third_place_enabled: boolean
      display_order: number
    } | null
    // The event must belong to THIS public tournament (cross-tournament / draft access blocked).
    if (!event || event.tournament_id !== tournamentId) return null
    const format = event.format as EventFormat

    const [{ data: compRows }, { data: groupRows }, { data: memberRows }, { data: matchRows }, { data: overrideRows }, { data: podiumRows }] =
      await Promise.all([
        supabase
          .from('tournament_competitors')
          .select('id, name, short_name, seed, display_order')
          .eq('event_id', eventId)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('tournament_groups')
          .select('id, name, display_order')
          .eq('event_id', eventId)
          .order('display_order', { ascending: true }),
        supabase
          .from('tournament_group_memberships')
          .select('group_id, competitor_id, display_order')
          .eq('event_id', eventId)
          .order('display_order', { ascending: true }),
        supabase
          .from('tournament_matches')
          .select(
            'id, group_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, winner_competitor_id, source_match_a_id, source_match_b_id, source_outcome_a, source_outcome_b',
          )
          .eq('event_id', eventId)
          .order('round_number', { ascending: true })
          .order('match_number', { ascending: true }),
        // Qualification overrides are read through a SECURITY DEFINER RPC that exposes ONLY the
        // public-safe projection (group_id + resolved_order). anon/authenticated have no direct SELECT
        // on the base table, so `reason`/`created_by` never reach a Guest over REST or Realtime.
        supabase.rpc('tournament_public_qualification_overrides', { p_event_id: eventId }),
        supabase
          .from('tournament_podium')
          .select('bracket, rank, competitor_id, is_joint')
          .eq('event_id', eventId)
          .order('rank', { ascending: true }),
      ])
    const podiumRaw =
      (podiumRows as { bracket: string; rank: number; competitor_id: string; is_joint: boolean }[] | null) ?? []

    const rawComps = (compRows as RawCompetitorRow[] | null) ?? []
    const groups = ((groupRows as { id: string; name: string; display_order: number }[] | null) ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      displayOrder: g.display_order,
    }))
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]))
    const nameById = new Map(rawComps.map((c) => [c.id, c.name]))

    // competitor → group assignment
    const groupOf = new Map<string, string>()
    const groupMembers = new Map<string, string[]>()
    for (const g of groups) groupMembers.set(g.id, [])
    for (const m of (memberRows as { group_id: string; competitor_id: string }[] | null) ?? []) {
      groupOf.set(m.competitor_id, m.group_id)
      groupMembers.get(m.group_id)?.push(m.competitor_id)
    }

    const competitors: PublicCompetitor[] = rawComps.map((c) => {
      const gid = groupOf.get(c.id) ?? null
      return {
        id: c.id,
        name: c.name,
        shortName: c.short_name,
        seed: c.seed,
        groupId: gid,
        groupName: gid ? groupNameById.get(gid) ?? null : null,
      }
    })

    const allMatches = (matchRows as RawMatchRow[] | null) ?? []

    // Games for all matches in one query.
    const gamesByMatch = new Map<string, PublicScheduleGame[]>()
    if (allMatches.length > 0) {
      const { data: gameRows } = await supabase
        .from('tournament_match_games')
        .select('match_id, game_number, score_a, score_b')
        .in('match_id', allMatches.map((m) => m.id))
        .order('game_number', { ascending: true })
      for (const g of (gameRows as { match_id: string; game_number: number; score_a: number; score_b: number }[] | null) ?? []) {
        const view: PublicScheduleGame = { gameNumber: g.game_number, scoreA: g.score_a, scoreB: g.score_b }
        const list = gamesByMatch.get(g.match_id)
        if (list) list.push(view)
        else gamesByMatch.set(g.match_id, [view])
      }
    }

    // ── Knockout rows in the camelCase shape the structural helper + views expect ────────────────
    const koRows: KoRow[] = allMatches
      .filter((m) => m.stage === 'knockout')
      .map((m) => ({
        id: m.id,
        roundNumber: m.round_number,
        sourceMatchAId: m.source_match_a_id,
        sourceMatchBId: m.source_match_b_id,
        sourceOutcomeA: m.source_outcome_a,
        sourceOutcomeB: m.source_outcome_b,
        matchNumber: m.match_number,
        bracket: (m.bracket as 'championship' | 'consolation' | null) ?? 'championship',
        competitorAId: m.competitor_a_id,
        competitorBId: m.competitor_b_id,
        status: m.status,
        winnerId: m.winner_competitor_id,
      }))

    // ── Schedule (all matches, group + knockout) ────────────────────────────────────────────────
    // Reuse the pure structural helper to label knockout matches consistently in the schedule too.
    const roundLabelByMatchId = new Map<string, string>()
    for (const branch of ['championship', 'consolation'] as const) {
      const rows = koRows.filter((m) => m.bracket === branch)
      if (rows.length === 0) continue
      const built = buildBracketRounds(rows, (row, meta) => ({ id: row.id, label: meta.roundLabel }))
      for (const r of built.rounds) for (const mm of r.matches) roundLabelByMatchId.set(mm.id, mm.label)
      if (built.thirdPlaceMatch) roundLabelByMatchId.set(built.thirdPlaceMatch.id, 'third_place')
    }

    const schedule: PublicScheduleMatch[] = allMatches.map((m) => {
      const games = gamesByMatch.get(m.id) ?? []
      const t2 = tally(games)
      return {
        id: m.id,
        stage: m.stage as 'group' | 'knockout',
        bracket: (m.bracket as 'championship' | 'consolation' | null) ?? null,
        groupId: m.group_id,
        groupName: m.group_id ? groupNameById.get(m.group_id) ?? null : null,
        roundNumber: m.round_number,
        matchNumber: m.match_number,
        roundLabel: m.stage === 'knockout' ? roundLabelByMatchId.get(m.id) ?? null : null,
        competitorAId: m.competitor_a_id,
        competitorBId: m.competitor_b_id,
        status: m.status,
        winnerId: m.winner_competitor_id,
        games,
        gamesWonA: t2.a,
        gamesWonB: t2.b,
        isBye: m.status === 'bye',
      }
    })

    // ── Standings (group formats only), via the shared pure evaluation ──────────────────────────
    let standings: PublicGroupStandings[] = []
    if ((format === 'round_robin' || format === 'group_knockout') && groups.length > 0) {
      const overridesByGroup = new Map<string, string[]>()
      for (const o of (overrideRows as { group_id: string; resolved_order: unknown }[] | null) ?? []) {
        if (Array.isArray(o.resolved_order)) overridesByGroup.set(o.group_id, o.resolved_order as string[])
      }

      const matchesByGroup = new Map<string, MatchInput[]>()
      for (const m of allMatches) {
        if (m.stage !== 'group' || !m.group_id) continue
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

      const groupInputs: GroupEvaluationInput[] = groups.map((g) => ({
        groupId: g.id,
        competitors: (groupMembers.get(g.id) ?? []).map((id): Competitor => ({ id, name: nameById.get(id) ?? id })),
        matches: matchesByGroup.get(g.id) ?? [],
        resolvedOrder: overridesByGroup.get(g.id),
      }))

      const evaluation = evaluateGroupStage({
        format: format as GroupStageFormat,
        winnerQualifiers: event.winner_qualifiers_per_group,
        consolationQualifiers: event.consolation_qualifiers_per_group,
        groups: groupInputs,
      })

      standings = evaluation.groups.map((g) => {
        const champ = new Set(g.qualification.status === 'ok' ? g.qualification.championship : [])
        const conso = new Set(g.qualification.status === 'ok' ? g.qualification.consolation : [])
        const rows: PublicStandingRow[] = g.standings.rows.map((r) => {
          let qualification: PublicStandingRow['qualification']
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
        return {
          groupId: g.groupId,
          groupName: groupNameById.get(g.groupId) ?? g.groupId,
          rows,
          resolvedByOrganizer: g.hasOverride,
          hasUndetermined: format === 'group_knockout' && g.allCompleted && g.qualification.status !== 'ok',
        }
      })
    }

    // ── Brackets (knockout / group_knockout), via the shared structural helper ───────────────────
    const brackets: PublicBracket[] = []
    if (format === 'knockout' || format === 'group_knockout') {
      const branchList: ('championship' | 'consolation')[] =
        format === 'knockout' ? ['championship'] : ['championship', 'consolation']

      for (const branch of branchList) {
        const rows = koRows.filter((m) => m.bracket === branch)
        if (rows.length === 0) continue

        const toView = (m: KoRow, meta: { roundLabel: string; isFinal: boolean; isThirdPlace: boolean }): KnockoutMatchView => {
          const games = gamesByMatch.get(m.id) ?? []
          const t3 = tally(games)
          return {
            id: m.id,
            roundNumber: m.roundNumber,
            matchNumber: m.matchNumber,
            roundLabel: meta.roundLabel,
            competitorAId: m.competitorAId,
            competitorBId: m.competitorBId,
            status: m.status,
            version: 0, // placeholder — Guests never mutate; the real concurrency token is not exposed
            winnerId: m.winnerId,
            games,
            gamesWonA: t3.a,
            gamesWonB: t3.b,
            isFinal: meta.isFinal,
            isThirdPlace: meta.isThirdPlace,
          }
        }

        const built = buildBracketRounds(rows, toView)
        const rounds: KnockoutRoundView[] = built.rounds.map((r) => ({
          roundNumber: r.roundNumber,
          label: r.label,
          matches: [...r.matches],
        }))
        const podium: PodiumRowView[] = podiumRaw
          .filter((p) => p.bracket === branch)
          .map((p) => ({ rank: p.rank as 1 | 2 | 3, competitorId: p.competitor_id, isJoint: p.is_joint }))

        const finalRow = rows.find((m) => m.id === built.finalId) ?? null
        const thirdRow = built.thirdPlaceId ? rows.find((m) => m.id === built.thirdPlaceId) ?? null : null
        const isComplete =
          !!finalRow && finalRow.status === 'completed' && (!thirdRow || thirdRow.status === 'completed')

        brackets.push({
          bracket: branch,
          rounds,
          thirdPlaceMatch: built.thirdPlaceMatch,
          podium,
          hasBracket: rows.length > 0,
          isComplete,
        })
      }
    }

    // Public-safe scoring rules via the SECURITY DEFINER summary RPC. The RPC re-checks event
    // visibility (published/completed) itself, so a draft/archived event can never leak a summary even
    // if this call were reached. It exposes NO internal fields (no snapshot/preset id, no version, no
    // requires_configuration internals, no actor) — only the human-readable scoring numbers.
    let ruleSummary: PublicEventRuleSummary | null = null
    try {
      const { data: ruleRows } = await supabase.rpc('tournament_public_event_rule_summary', { p_event_id: eventId })
      const row = Array.isArray(ruleRows) ? (ruleRows[0] as RawPublicRuleSummaryRow | undefined) : undefined
      ruleSummary = toPublicEventRuleSummary(row ?? null)
    } catch {
      ruleSummary = null
    }

    const summary: PublicEventSummary = {
      id: event.id,
      name: event.name,
      format,
      status: event.status,
      groupCount: event.group_count,
      winnerQualifiersPerGroup: event.winner_qualifiers_per_group,
      consolationQualifiersPerGroup: event.consolation_qualifiers_per_group,
      thirdPlaceEnabled: event.third_place_enabled,
      displayOrder: event.display_order,
      competitorCount: rawComps.length,
      matchCount: allMatches.length,
      completedMatchCount: allMatches.filter((m) => m.status === 'completed' || m.status === 'bye').length,
    }

    return {
      event: summary,
      competitors,
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      schedule,
      standings,
      brackets,
      hasGroups: groups.length > 0,
      hasKnockout: koRows.length > 0,
      ruleSummary,
    }
  } catch {
    return null
  }
}
