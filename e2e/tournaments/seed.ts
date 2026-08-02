// Service-role seed + cleanup for the tournament E2E suite. NODE / TEST CONTEXT ONLY — never import
// this from a browser bundle (it holds the service-role key). It writes rows directly (bypassing RLS)
// to construct exact starting states the UI then reads, which is far more reliable than clicking every
// upstream step. Everything it creates is tagged with RUN_PREFIX so cleanup only removes its own data
// and re-runs never collide or duplicate.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { SUPABASE_URL, SERVICE_ROLE_KEY, RUN_PREFIX, assertLocalTarget } from './_env'

export type EventFormat = 'round_robin' | 'knockout' | 'group_knockout'
export type TournamentStatus = 'draft' | 'published' | 'completed' | 'archived'

let _admin: SupabaseClient | null = null
export function admin(): SupabaseClient {
  assertLocalTarget() // hard-refuses any non-local target before the first write
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _admin
}

const iso = (d: Date) => d.toISOString()
const daysFromNow = (n: number) => iso(new Date(Date.now() + n * 86400_000))

export interface TournamentHandle {
  id: string
  slug: string
  name: string
  updatedAt: string
}

export async function createTournament(opts: {
  status?: TournamentStatus
  label?: string
  startsAt?: string | null
  endsAt?: string | null
  location?: string | null
} = {}): Promise<TournamentHandle> {
  const id = randomUUID()
  const suffix = opts.label ? `-${opts.label}` : ''
  const name = `${RUN_PREFIX}${suffix} ${id.slice(0, 8)}`
  const slug = `${RUN_PREFIX.toLowerCase()}${suffix.toLowerCase()}-${id.slice(0, 8)}`
  const { data, error } = await admin()
    .from('tournaments')
    .insert({
      id,
      slug,
      name,
      status: opts.status ?? 'draft',
      starts_at: opts.startsAt === undefined ? daysFromNow(1) : opts.startsAt,
      ends_at: opts.endsAt === undefined ? daysFromNow(3) : opts.endsAt,
      location: opts.location === undefined ? 'Tokyo' : opts.location,
    })
    .select('id, slug, name, updated_at')
    .single()
  if (error) throw new Error(`seed createTournament: ${error.message}`)
  return { id: data.id, slug: data.slug, name: data.name, updatedAt: data.updated_at }
}

export interface EventHandle {
  id: string
  version: number
  format: EventFormat
}

export async function addEvent(
  tournamentId: string,
  opts: {
    format: EventFormat
    label?: string
    groupCount?: number
    winnerQualifiersPerGroup?: number
    consolationQualifiersPerGroup?: number
    thirdPlaceEnabled?: boolean
    status?: string
    displayOrder?: number
  },
): Promise<EventHandle> {
  const { data, error } = await admin()
    .from('tournament_events')
    .insert({
      tournament_id: tournamentId,
      name: `${opts.label ?? opts.format} ${RUN_PREFIX}`,
      format: opts.format,
      group_count: opts.groupCount ?? (opts.format === 'knockout' ? 0 : 1),
      winner_qualifiers_per_group: opts.winnerQualifiersPerGroup ?? 2,
      consolation_qualifiers_per_group: opts.consolationQualifiersPerGroup ?? 0,
      third_place_enabled: opts.thirdPlaceEnabled ?? false,
      status: opts.status ?? 'setup',
      display_order: opts.displayOrder ?? 0,
      version: 1,
    })
    .select('id, version, format')
    .single()
  if (error) throw new Error(`seed addEvent: ${error.message}`)
  return { id: data.id, version: data.version, format: data.format as EventFormat }
}

export interface CompetitorHandle {
  id: string
  name: string
  shortName: string
}

export async function addCompetitors(eventId: string, names: string[]): Promise<CompetitorHandle[]> {
  // short_name left null so the admin roster renders just the name (keeps exact-text assertions clean).
  const rows = names.map((name, i) => ({
    id: randomUUID(),
    event_id: eventId,
    name,
    short_name: null as string | null,
    seed: i + 1,
    display_order: i,
  }))
  const { data, error } = await admin().from('tournament_competitors').insert(rows).select('id, name, short_name')
  if (error) throw new Error(`seed addCompetitors: ${error.message}`)
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, shortName: r.short_name ?? r.name }))
}

export async function addGroup(eventId: string, name: string, displayOrder = 0): Promise<string> {
  const { data, error } = await admin()
    .from('tournament_groups')
    .insert({ id: randomUUID(), event_id: eventId, name, display_order: displayOrder })
    .select('id')
    .single()
  if (error) throw new Error(`seed addGroup: ${error.message}`)
  return data.id
}

export async function assignToGroup(eventId: string, groupId: string, competitorIds: string[]): Promise<void> {
  const rows = competitorIds.map((cid, i) => ({
    id: randomUUID(),
    event_id: eventId,
    group_id: groupId,
    competitor_id: cid,
    display_order: i,
  }))
  const { error } = await admin().from('tournament_group_memberships').insert(rows)
  if (error) throw new Error(`seed assignToGroup: ${error.message}`)
}

// Insert one already-completed group match with a single game and a winner.
export async function addCompletedGroupMatch(opts: {
  eventId: string
  groupId: string
  matchNumber: number
  aId: string
  bId: string
  winnerId: string
  scoreWin?: number
  scoreLose?: number
}): Promise<void> {
  const matchId = randomUUID()
  const { error: mErr } = await admin()
    .from('tournament_matches')
    .insert({
      id: matchId,
      event_id: opts.eventId,
      group_id: opts.groupId,
      stage: 'group',
      bracket: null,
      round_number: 0,
      match_number: opts.matchNumber,
      competitor_a_id: opts.aId,
      competitor_b_id: opts.bId,
      status: 'completed',
      winner_competitor_id: opts.winnerId,
      // UNIQUE(event_id, generation_key) → one key per match within an event.
      generation_key: `${RUN_PREFIX}-g0-m${opts.matchNumber}`,
      version: 1,
    })
  if (mErr) throw new Error(`seed addCompletedGroupMatch(match): ${mErr.message}`)
  const scoreA = opts.winnerId === opts.aId ? (opts.scoreWin ?? 21) : (opts.scoreLose ?? 10)
  const scoreB = opts.winnerId === opts.bId ? (opts.scoreWin ?? 21) : (opts.scoreLose ?? 10)
  const { error: gErr } = await admin()
    .from('tournament_match_games')
    .insert({ id: randomUUID(), match_id: matchId, game_number: 1, score_a: scoreA, score_b: scoreB })
  if (gErr) throw new Error(`seed addCompletedGroupMatch(game): ${gErr.message}`)
}

export async function addKnockoutMatch(opts: {
  eventId: string
  bracket: 'championship' | 'consolation'
  matchNumber: number
  aId: string
  bId: string
}): Promise<void> {
  const { error } = await admin().from('tournament_matches').insert({
    id: randomUUID(),
    event_id: opts.eventId,
    group_id: null,
    stage: 'knockout',
    bracket: opts.bracket,
    round_number: 1,
    match_number: opts.matchNumber,
    competitor_a_id: opts.aId,
    competitor_b_id: opts.bId,
    status: 'ready',
    winner_competitor_id: null,
    generation_key: `ko:${opts.bracket}:r1:m${opts.matchNumber}`,
    version: 1,
  })
  if (error) throw new Error(`seed addKnockoutMatch: ${error.message}`)
}

export async function setEventStatus(eventId: string, status: string): Promise<void> {
  const { error } = await admin().from('tournament_events').update({ status }).eq('id', eventId)
  if (error) throw new Error(`seed setEventStatus: ${error.message}`)
}

export async function setPodium(
  eventId: string,
  entries: { rank: number; competitorId: string; bracket?: string; isJoint?: boolean }[],
): Promise<void> {
  const rows = entries.map((e) => ({
    id: randomUUID(),
    event_id: eventId,
    bracket: e.bracket ?? null,
    rank: e.rank,
    competitor_id: e.competitorId,
    is_joint: e.isJoint ?? false,
  }))
  const { error } = await admin().from('tournament_podium').insert(rows)
  if (error) throw new Error(`seed setPodium: ${error.message}`)
}

export async function saveQualificationOverride(
  eventId: string,
  groupId: string,
  orderedCompetitorIds: string[],
  reason = 'internal note',
): Promise<void> {
  const { error } = await admin().from('tournament_qualification_overrides').insert({
    id: randomUUID(),
    event_id: eventId,
    group_id: groupId,
    resolved_order: orderedCompetitorIds,
    reason,
  })
  if (error) throw new Error(`seed saveQualificationOverride: ${error.message}`)
}

// ── Composite fixture: a PUBLISHED tournament with one COMPLETED round-robin event (1 group of 4).
// Standings resolve to a strict order c0 > c1 > c2 > c3, top-2 qualify. Returns everything a spec
// needs to assert public + admin views.
export interface RoundRobinFixture {
  tournament: TournamentHandle
  event: EventHandle
  groupId: string
  competitors: CompetitorHandle[]
  /** competitor ids in expected finishing order (index 0 = 1st). */
  expectedOrder: string[]
  qualifierIds: string[]
}

export async function seedPublishedRoundRobin(opts: { completed?: boolean } = {}): Promise<RoundRobinFixture> {
  const completed = opts.completed ?? true
  const tournament = await createTournament({ status: 'published', label: 'rr' })
  const event = await addEvent(tournament.id, { format: 'round_robin', label: 'RR', groupCount: 1, winnerQualifiersPerGroup: 2 })
  // Competitor names need no run tag — cleanup deletes the whole tournament (cascade). Clean labels
  // keep display + assertions readable (short_name is derived from these, so avoid truncation noise).
  const competitors = await addCompetitors(event.id, ['Alpha', 'Bravo', 'Charlie', 'Delta'])
  const groupId = await addGroup(event.id, 'A')
  await assignToGroup(event.id, groupId, competitors.map((c) => c.id))

  if (completed) {
    const [c0, c1, c2, c3] = competitors
    // Strict hierarchy: c0 beats all; c1 beats c2,c3; c2 beats c3.
    const results: [string, string, string][] = [
      [c0.id, c1.id, c0.id],
      [c0.id, c2.id, c0.id],
      [c0.id, c3.id, c0.id],
      [c1.id, c2.id, c1.id],
      [c1.id, c3.id, c1.id],
      [c2.id, c3.id, c2.id],
    ]
    let n = 1
    for (const [a, b, w] of results) {
      await addCompletedGroupMatch({ eventId: event.id, groupId, matchNumber: n++, aId: a, bId: b, winnerId: w })
    }
    await setEventStatus(event.id, 'completed')
  }

  return {
    tournament,
    event,
    groupId,
    competitors,
    expectedOrder: [competitors[0].id, competitors[1].id, competitors[2].id, competitors[3].id],
    qualifierIds: [competitors[0].id, competitors[1].id],
  }
}

// ── Composite fixture: a PUBLISHED round-robin event whose single group already has its 4 members
// assigned but NO schedule yet (status 'setup'). The admin workspace opens ready to preview + generate.
export async function seedRoundRobinReadyToGenerate(): Promise<RoundRobinFixture> {
  const tournament = await createTournament({ status: 'published', label: 'rrgen' })
  const event = await addEvent(tournament.id, { format: 'round_robin', label: 'RR', groupCount: 1, winnerQualifiersPerGroup: 2 })
  const competitors = await addCompetitors(event.id, ['Alpha', 'Bravo', 'Charlie', 'Delta'])
  const groupId = await addGroup(event.id, 'A')
  await assignToGroup(event.id, groupId, competitors.map((c) => c.id))
  return {
    tournament,
    event,
    groupId,
    competitors,
    expectedOrder: competitors.map((c) => c.id),
    qualifierIds: [competitors[0].id, competitors[1].id],
  }
}

export interface GroupKnockoutLabelFixture {
  tournament: TournamentHandle
  event: EventHandle
  competitors: CompetitorHandle[]
}

// Published group+knockout fixture for branch-label QA. `includeStaleSerieB` deliberately permits a
// persisted Serie B row with quota=0 so the public read-model gate is verified, not merely empty data.
export async function seedPublishedGroupKnockoutLabels(opts: {
  consolationQuota: number
  includeStaleSerieB?: boolean
}): Promise<GroupKnockoutLabelFixture> {
  const tournament = await createTournament({ status: 'published', label: `gk-label-${opts.consolationQuota}` })
  const event = await addEvent(tournament.id, {
    format: 'group_knockout',
    label: 'GK labels',
    groupCount: 1,
    winnerQualifiersPerGroup: 2,
    consolationQualifiersPerGroup: opts.consolationQuota,
    status: 'knockout_running',
  })
  const competitors = await addCompetitors(event.id, ['Alpha A', 'Bravo A', 'Alpha B', 'Bravo B'])
  await addKnockoutMatch({
    eventId: event.id,
    bracket: 'championship',
    matchNumber: 1,
    aId: competitors[0].id,
    bId: competitors[1].id,
  })
  if (opts.consolationQuota > 0 || opts.includeStaleSerieB) {
    await addKnockoutMatch({
      eventId: event.id,
      bracket: 'consolation',
      matchNumber: 1,
      aId: competitors[2].id,
      bId: competitors[3].id,
    })
  }
  return { tournament, event, competitors }
}

// ── Membership seeding (15B-2E) ───────────────────────────────────────────────────────────────
// Scoped-role helpers. Memberships are always attached to a RUN_PREFIX tournament, so cleanupRun's
// ON DELETE CASCADE removes them too — no separate member cleanup is needed.
export type MemberRole = 'manager' | 'scorekeeper'
export type MemberStatus = 'pending' | 'active' | 'revoked'

const normEmail = (e: string) => e.toLowerCase().trim()

// Resolve an auth user id by email (the setup project provisions these before any spec runs).
export async function authUserIdByEmail(email: string): Promise<string> {
  const a = admin()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  throw new Error(`seed authUserIdByEmail: no auth user for ${email}`)
}

// A PENDING invitation (unbound to any user) keyed by normalized email — the exact state the invite
// action produces. The invitee binds it by claiming on first sign-in.
export async function invitePendingMember(opts: {
  tournamentId: string
  email: string
  role: MemberRole
}): Promise<string> {
  const { data, error } = await admin()
    .from('tournament_members')
    .insert({
      tournament_id: opts.tournamentId,
      email_normalized: normEmail(opts.email),
      role: opts.role,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed invitePendingMember: ${error.message}`)
  return data.id
}

// An already-ACTIVE membership bound to a real user (satisfies the tmem_active_bound CHECK). Used to
// put a manager / scorekeeper straight into a tournament without driving the whole claim flow.
export async function seedActiveMember(opts: {
  tournamentId: string
  email: string
  role: MemberRole
  userId: string
}): Promise<string> {
  const { data, error } = await admin()
    .from('tournament_members')
    .insert({
      tournament_id: opts.tournamentId,
      user_id: opts.userId,
      email_normalized: normEmail(opts.email),
      role: opts.role,
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed seedActiveMember: ${error.message}`)
  return data.id
}

// A REVOKED invitation (satisfies tmem_revoked_stamped). The claim RPC must skip these.
export async function seedRevokedMember(opts: {
  tournamentId: string
  email: string
  role: MemberRole
}): Promise<string> {
  const { data, error } = await admin()
    .from('tournament_members')
    .insert({
      tournament_id: opts.tournamentId,
      email_normalized: normEmail(opts.email),
      role: opts.role,
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed seedRevokedMember: ${error.message}`)
  return data.id
}

// Read one membership row back for assertions (status transitions, binding, version).
export interface MemberSnapshot {
  status: MemberStatus
  userId: string | null
  role: MemberRole
  version: number
}
export async function getMemberSnapshot(opts: {
  tournamentId: string
  email: string
}): Promise<MemberSnapshot | null> {
  const { data } = await admin()
    .from('tournament_members')
    .select('status, user_id, role, version')
    .eq('tournament_id', opts.tournamentId)
    .eq('email_normalized', normEmail(opts.email))
    .maybeSingle()
  if (!data) return null
  return {
    status: data.status as MemberStatus,
    userId: (data.user_id as string | null) ?? null,
    role: data.role as MemberRole,
    version: data.version as number,
  }
}

// Directly revoke a member (service-role), for deterministic "revoke while logged in" setups that do
// not go through the Site-Admin UI. Idempotent-ish: only flips a currently-active/pending row.
export async function revokeMemberDirect(opts: {
  tournamentId: string
  email: string
}): Promise<void> {
  const { error } = await admin()
    .from('tournament_members')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('tournament_id', opts.tournamentId)
    .eq('email_normalized', normEmail(opts.email))
    .neq('status', 'revoked')
  if (error) throw new Error(`seed revokeMemberDirect: ${error.message}`)
}

// ── Rule engine seeding (15C-2) ─────────────────────────────────────────────────────────────────
// The FJP Olympiad 2026 preset payload — the DB mirror of buildFjpOlympiad2026Preset() (see
// lib/tournaments/rules/presets.ts + seed_tournament_rule_presets.sql). Beginner group touch-15,
// Standard group touch-21; both knockout touch-21 win-by-2 cap 31; handicap enabled but PENDING
// (entries [], requires_configuration true) — never seeded with guessed numbers.
export const FJP_PRESET_KEY = 'fjp_olympiad_2026'
export const FJP_PRESET_VERSION = 1

const FJP_TIE_BREAK = ['table_points', 'point_difference', 'points_for', 'organizer_decision']
function fjpVariant(category: 'beginner' | 'standard', groupPoints: number) {
  return {
    category,
    rules: {
      group: {
        match: { games_to_win: 1, max_games: 1, points_to_win: groupPoints, win_by: 1, points_cap: null, allow_tied_game: false },
        win_table_points: 1,
        loss_table_points: 0,
        tie_break_order: FJP_TIE_BREAK,
      },
      knockout: {
        match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
      },
      handicap: { enabled: true, mode: 'starting_score', entries: [], requires_configuration: true },
    },
  }
}

// Idempotent upsert of the FJP preset so the picker has it. Safe to call in beforeAll of every run.
export async function seedFjpPreset(): Promise<void> {
  const payload = [fjpVariant('beginner', 15), fjpVariant('standard', 21)]
  const { error } = await admin()
    .from('tournament_rule_presets')
    .upsert(
      {
        preset_key: FJP_PRESET_KEY,
        version: FJP_PRESET_VERSION,
        label: 'FJP Olympiad 2026',
        description: 'FJP Olympiad 2026 badminton preset (E2E seed).',
        schema_version: 1,
        is_default: false,
        requires_configuration: true,
        status: 'active',
        payload,
      },
      { onConflict: 'preset_key,version' },
    )
  if (error) throw new Error(`seed seedFjpPreset: ${error.message}`)
}

export interface RuleSnapshotSeed {
  eventId: string
  source: 'default' | 'preset' | 'custom'
  presetKey?: string | null
  presetVersion?: number | null
  category?: string | null
  requiresConfiguration?: boolean
  snapshotVersion?: number
  payload: unknown
}

// A ready-made custom rule payload (touch-21 group, knockout touch-21 win-by-2 cap 31, handicap off).
export function customRulePayload(groupPoints = 21) {
  return {
    group: {
      match: { games_to_win: 1, max_games: 1, points_to_win: groupPoints, win_by: 1, points_cap: null, allow_tied_game: false },
      win_table_points: 1,
      loss_table_points: 0,
      tie_break_order: ['table_points', 'point_difference', 'points_for'],
    },
    knockout: { match: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false } },
    handicap: { enabled: false, mode: 'starting_score', entries: [], requires_configuration: false },
  }
}

// Insert an event rule snapshot directly (the exact starting state the UI then reads/asserts).
export async function seedRuleSnapshot(s: RuleSnapshotSeed): Promise<string> {
  const isPreset = s.source === 'preset'
  const { data, error } = await admin()
    .from('tournament_event_rule_snapshots')
    .insert({
      event_id: s.eventId,
      source: s.source,
      preset_key: isPreset ? s.presetKey ?? FJP_PRESET_KEY : null,
      preset_version: isPreset ? s.presetVersion ?? FJP_PRESET_VERSION : null,
      category: s.category ?? null,
      schema_version: 1,
      snapshot_version: s.snapshotVersion ?? 1,
      requires_configuration: s.requiresConfiguration ?? false,
      payload: s.payload,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed seedRuleSnapshot: ${error.message}`)
  return data.id
}

export interface RuleSnapshotRead {
  id: string
  source: string
  presetKey: string | null
  presetVersion: number | null
  category: string | null
  snapshotVersion: number
  requiresConfiguration: boolean
  version: number
  payload: Record<string, unknown>
}

export async function readRuleSnapshot(eventId: string): Promise<RuleSnapshotRead | null> {
  const { data } = await admin()
    .from('tournament_event_rule_snapshots')
    .select('id, source, preset_key, preset_version, category, snapshot_version, requires_configuration, version, payload')
    .eq('event_id', eventId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    source: data.source,
    presetKey: data.preset_key,
    presetVersion: data.preset_version,
    category: data.category,
    snapshotVersion: data.snapshot_version,
    requiresConfiguration: data.requires_configuration,
    version: data.version,
    payload: data.payload as Record<string, unknown>,
  }
}

// Count audit rows for an event by action (proves reset/delete/apply wrote exactly one entry each).
export async function countAudit(eventId: string, action: string): Promise<number> {
  const { count } = await admin()
    .from('tournament_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('action', action)
  return count ?? 0
}

// ── Cleanup: delete every tournament this run created (cascades to events/competitors/groups/
// matches/games/podium/overrides/members). Safe to call in afterAll even after failures.
export async function cleanupRun(): Promise<{ deleted: number }> {
  assertLocalTarget()
  const { data, error } = await admin()
    .from('tournaments')
    .delete()
    .like('name', `${RUN_PREFIX}%`)
    .select('id')
  if (error) throw new Error(`seed cleanupRun: ${error.message}`)
  return { deleted: data?.length ?? 0 }
}
