'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'

// ── Types ─────────────────────────────────────────────────────────────────────
export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'finished'
  | 'cancelled'

export type MatchStatus =
  | 'pending'
  | 'ready'
  | 'playing'
  | 'finished'
  | 'cancelled'
  | 'walkover'

export type CaroTournament = {
  id: string
  title: string
  description: string | null
  type: 'single_elimination' | 'group_stage'
  status: TournamentStatus
  max_players: number
  num_groups: number | null
  advance_per_group: number | null
  registration_start_at: string | null
  registration_end_at: string | null
  start_at: string | null
  end_at: string | null
  champion_user_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  rules: string | null
  prize: string | null
  is_public: boolean
}

export type TournamentParticipant = {
  id: string
  tournament_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
  status: 'registered' | 'checked_in' | 'eliminated' | 'champion' | 'withdrawn'
  seed: number | null
  joined_at: string
  eliminated_at: string | null
}

export type TournamentMatch = {
  id: string
  tournament_id: string
  round_number: number
  match_number: number
  player_x_id: string | null
  player_o_id: string | null
  winner_user_id: string | null
  loser_user_id: string | null
  room_code: string | null
  status: MatchStatus
  group_id: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export type TournamentGroup = {
  id: string
  tournament_id: string
  name: string
  group_order: number
  created_at: string
  updated_at: string
}

export type TournamentGroupMember = {
  id: string
  tournament_id: string
  group_id: string
  participant_id: string
  user_id: string
  created_at: string
}

export type AdminActionResult = { error: string } | { success: true; id?: string } | null

// ── Guards ────────────────────────────────────────────────────────────────────
async function requireAdmin(): Promise<void> {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) redirect('/')
}

// ── createTournament ──────────────────────────────────────────────────────────
export async function createTournament(formData: FormData): Promise<never> {
  await requireAdmin()
  const admin = createAdminClient()

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = (formData.get('title') as string)?.trim()
  if (!title) redirect('/admin/caro?error=no_title')

  const maxPlayers = parseInt(formData.get('max_players') as string) || 8
  const openNow = formData.get('open_now') === '1'
  const type = (formData.get('type') as string) === 'group_stage' ? 'group_stage' : 'single_elimination'
  const numGroups = parseInt(formData.get('num_groups') as string) || null

  const { data, error } = await admin.from('caro_tournaments').insert({
    title,
    description: (formData.get('description') as string)?.trim() || null,
    rules: (formData.get('rules') as string)?.trim() || null,
    prize: (formData.get('prize') as string)?.trim() || null,
    max_players: maxPlayers,
    type,
    num_groups: type === 'group_stage' ? (numGroups ?? 2) : null,
    advance_per_group: type === 'group_stage' ? 1 : null,
    status: openNow ? 'registration_open' : 'draft',
    registration_start_at: openNow ? new Date().toISOString() : null,
    start_at: (formData.get('start_at') as string) || null,
    created_by: user.id,
    is_public: true,
  }).select('id').single()

  if (error) redirect(`/admin/caro?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/games/caro/tournaments')
  revalidatePath('/admin/caro')
  redirect(`/admin/caro/${data.id}`)
}

// ── updateTournamentStatus ────────────────────────────────────────────────────
export async function updateTournamentStatus(
  tournamentId: string,
  newStatus: TournamentStatus,
): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'registration_open') updates.registration_start_at = new Date().toISOString()
  if (newStatus === 'registration_closed') updates.registration_end_at = new Date().toISOString()
  if (newStatus === 'in_progress') updates.start_at = new Date().toISOString()
  if (newStatus === 'finished') updates.end_at = new Date().toISOString()

  const { error } = await admin.from('caro_tournaments').update(updates).eq('id', tournamentId)
  if (error) return { error: error.message }

  revalidatePath('/games/caro/tournaments')
  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  revalidatePath('/admin/caro')
  revalidatePath(`/admin/caro/${tournamentId}`)
  return { success: true }
}

// ── generateBracket (single elimination) ─────────────────────────────────────
export async function generateBracket(tournamentId: string): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: tournament } = await admin
    .from('caro_tournaments')
    .select('id, status, max_players')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return { error: 'tournament_not_found' }
  if (!['registration_closed', 'in_progress'].includes(tournament.status)) {
    return { error: 'tournament_must_be_closed' }
  }

  const { data: existingMatches } = await admin
    .from('caro_tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 1)

  if (existingMatches && existingMatches.length > 0) {
    return { error: 'bracket_already_generated' }
  }

  const { data: participants } = await admin
    .from('caro_tournament_participants')
    .select('user_id, display_name')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '("withdrawn")')
    .order('joined_at')

  if (!participants || participants.length < 2) {
    return { error: 'not_enough_players' }
  }

  const shuffled = [...participants].sort(() => Math.random() - 0.5)
  const n = shuffled.length
  let bracketSize = 2
  while (bracketSize < n) bracketSize *= 2

  const totalRounds = Math.log2(bracketSize)
  const byeCount = bracketSize - n

  const pairedSlots: (string | null)[] = [
    ...shuffled.map(p => p.user_id),
    ...Array(byeCount).fill(null),
  ]

  const round1Matches: Array<{
    tournament_id: string
    round_number: number
    match_number: number
    player_x_id: string | null
    player_o_id: string | null
    status: MatchStatus
    winner_user_id: string | null
    group_id: null
  }> = []

  const matchCount = bracketSize / 2
  for (let m = 0; m < matchCount; m++) {
    const px = pairedSlots[m * 2] ?? null
    const po = pairedSlots[m * 2 + 1] ?? null
    const isBye = px === null || po === null
    const byeWinner = isBye ? (px ?? po) : null

    round1Matches.push({
      tournament_id: tournamentId,
      round_number: 1,
      match_number: m + 1,
      player_x_id: px,
      player_o_id: po,
      status: isBye ? 'walkover' : 'pending',
      winner_user_id: byeWinner,
      group_id: null,
    })
  }

  const allMatches: typeof round1Matches = [...round1Matches]
  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r)
    for (let m = 1; m <= matchesInRound; m++) {
      allMatches.push({
        tournament_id: tournamentId,
        round_number: r,
        match_number: m,
        player_x_id: null,
        player_o_id: null,
        status: 'pending',
        winner_user_id: null,
        group_id: null,
      })
    }
  }

  const { error } = await admin.from('caro_tournament_matches').insert(allMatches)
  if (error) return { error: error.message }

  for (const m of round1Matches) {
    if (m.status === 'walkover' && m.winner_user_id) {
      await advanceWinner(admin, tournamentId, 1, m.match_number, m.winner_user_id)
    }
  }

  await admin.from('caro_tournaments').update({ status: 'in_progress' }).eq('id', tournamentId)

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  revalidatePath(`/admin/caro/${tournamentId}`)
  return { success: true }
}

// ── generateGroupStage ────────────────────────────────────────────────────────
export async function generateGroupStage(tournamentId: string): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: tournament } = await admin
    .from('caro_tournaments')
    .select('id, status, type, num_groups')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return { error: 'tournament_not_found' }
  if (tournament.type !== 'group_stage') return { error: 'wrong_tournament_type' }
  if (!['registration_closed', 'in_progress'].includes(tournament.status)) {
    return { error: 'tournament_must_be_closed' }
  }

  const { data: existingGroups } = await admin
    .from('caro_tournament_groups')
    .select('id')
    .eq('tournament_id', tournamentId)
    .limit(1)

  if (existingGroups && existingGroups.length > 0) return { error: 'groups_already_generated' }

  const { data: participants } = await admin
    .from('caro_tournament_participants')
    .select('id, user_id, display_name')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '("withdrawn")')
    .order('joined_at')

  if (!participants || participants.length < 2) return { error: 'not_enough_players' }

  const numGroups = tournament.num_groups ?? (participants.length <= 8 ? 2 : 4)
  if (participants.length < numGroups * 2) return { error: 'not_enough_players' }

  const shuffled = [...participants].sort(() => Math.random() - 0.5)

  // Create groups: Bảng A, Bảng B, ...
  const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const groupInserts = Array.from({ length: numGroups }, (_, i) => ({
    tournament_id: tournamentId,
    name: `Bảng ${groupNames[i]}`,
    group_order: i + 1,
  }))

  const { data: groups, error: groupError } = await admin
    .from('caro_tournament_groups')
    .insert(groupInserts)
    .select('id, name, group_order')

  if (groupError || !groups) return { error: groupError?.message ?? 'group_create_failed' }
  groups.sort((a, b) => a.group_order - b.group_order)

  // Assign participants round-robin: player 0 → group 0, player 1 → group 1, ...
  const groupBuckets: Record<string, typeof shuffled> = {}
  for (const g of groups) groupBuckets[g.id] = []
  shuffled.forEach((p, i) => groupBuckets[groups[i % numGroups].id].push(p))

  // Insert group members
  const memberInserts: {
    tournament_id: string; group_id: string; participant_id: string; user_id: string
  }[] = []

  for (const g of groups) {
    for (const p of groupBuckets[g.id]) {
      memberInserts.push({
        tournament_id: tournamentId,
        group_id: g.id,
        participant_id: p.id,
        user_id: p.user_id,
      })
    }
  }

  const { error: memberError } = await admin
    .from('caro_tournament_group_members')
    .insert(memberInserts)

  if (memberError) return { error: memberError.message }

  // Create round-robin matches (round_number=0 identifies group stage)
  let matchNumber = 1
  const matchInserts: Array<{
    tournament_id: string
    round_number: number
    match_number: number
    player_x_id: string
    player_o_id: string
    status: MatchStatus
    group_id: string
    winner_user_id: null
  }> = []

  for (const g of groups) {
    const members = groupBuckets[g.id]
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        matchInserts.push({
          tournament_id: tournamentId,
          round_number: 0,
          match_number: matchNumber++,
          player_x_id: members[i].user_id,
          player_o_id: members[j].user_id,
          status: 'pending',
          group_id: g.id,
          winner_user_id: null,
        })
      }
    }
  }

  const { error: matchError } = await admin
    .from('caro_tournament_matches')
    .insert(matchInserts)

  if (matchError) return { error: matchError.message }

  await admin.from('caro_tournaments').update({ status: 'in_progress' }).eq('id', tournamentId)

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  revalidatePath(`/admin/caro/${tournamentId}`)
  return { success: true }
}

// ── generateKnockout (after group stage) ─────────────────────────────────────
export async function generateKnockout(
  tournamentId: string,
  advancePerGroup: number = 1,
): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  // Ensure no knockout matches exist yet
  const { data: existingKO } = await admin
    .from('caro_tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .gte('round_number', 1)
    .limit(1)

  if (existingKO && existingKO.length > 0) return { error: 'knockout_already_generated' }

  // Get all group stage matches
  const { data: groupMatches } = await admin
    .from('caro_tournament_matches')
    .select('group_id, player_x_id, player_o_id, winner_user_id, loser_user_id, status')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 0)

  if (!groupMatches || groupMatches.length === 0) return { error: 'no_group_matches' }

  // Ensure all group matches are done
  const pending = groupMatches.filter(m => !['finished', 'walkover'].includes(m.status))
  if (pending.length > 0) return { error: 'group_stage_not_complete' }

  // Get groups and members
  const [{ data: groups }, { data: groupMembers }] = await Promise.all([
    admin.from('caro_tournament_groups').select('id, group_order').eq('tournament_id', tournamentId).order('group_order'),
    admin.from('caro_tournament_group_members').select('group_id, user_id').eq('tournament_id', tournamentId),
  ])

  if (!groups || groups.length === 0) return { error: 'no_groups' }
  if (!groupMembers) return { error: 'no_group_members' }

  // Compute standings per group, collect advancing players
  const advancingIds: string[] = []

  for (const group of groups) {
    const members = groupMembers.filter(m => m.group_id === group.id)
    const stats: Record<string, { user_id: string; wins: number; draws: number; losses: number; points: number }> = {}

    for (const m of members) {
      stats[m.user_id] = { user_id: m.user_id, wins: 0, draws: 0, losses: 0, points: 0 }
    }

    const finished = groupMatches.filter(
      m => m.group_id === group.id && (m.status === 'finished' || m.status === 'walkover'),
    )

    for (const match of finished) {
      if (!match.winner_user_id) {
        if (match.player_x_id && stats[match.player_x_id]) { stats[match.player_x_id].draws++; stats[match.player_x_id].points++ }
        if (match.player_o_id && stats[match.player_o_id]) { stats[match.player_o_id].draws++; stats[match.player_o_id].points++ }
      } else {
        if (stats[match.winner_user_id]) { stats[match.winner_user_id].wins++; stats[match.winner_user_id].points += 3 }
        if (match.loser_user_id && stats[match.loser_user_id]) stats[match.loser_user_id].losses++
      }
    }

    const ranked = Object.values(stats).sort((a, b) =>
      b.points !== a.points ? b.points - a.points : b.wins - a.wins
    )

    for (let i = 0; i < Math.min(advancePerGroup, ranked.length); i++) {
      advancingIds.push(ranked[i].user_id)
    }
  }

  if (advancingIds.length < 2) return { error: 'not_enough_advancing' }

  // Mark non-advancing players as eliminated
  const { data: allParticipants } = await admin
    .from('caro_tournament_participants')
    .select('user_id')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '("withdrawn","eliminated","champion")')

  if (allParticipants) {
    const eliminatedIds = allParticipants
      .filter(p => !advancingIds.includes(p.user_id))
      .map(p => p.user_id)

    if (eliminatedIds.length > 0) {
      await admin.from('caro_tournament_participants')
        .update({ status: 'eliminated', eliminated_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId)
        .in('user_id', eliminatedIds)
    }
  }

  // Build single-elimination bracket from advancing players
  const shuffled = [...advancingIds].sort(() => Math.random() - 0.5)
  const n = shuffled.length
  let bracketSize = 2
  while (bracketSize < n) bracketSize *= 2
  const totalRounds = Math.log2(bracketSize)
  const byeCount = bracketSize - n

  const slots: (string | null)[] = [...shuffled, ...Array(byeCount).fill(null)]

  const round1: Array<{
    tournament_id: string; round_number: number; match_number: number
    player_x_id: string | null; player_o_id: string | null
    status: MatchStatus; winner_user_id: string | null; group_id: null
  }> = []

  const matchCount = bracketSize / 2
  for (let m = 0; m < matchCount; m++) {
    const px = slots[m * 2] ?? null
    const po = slots[m * 2 + 1] ?? null
    const isBye = px === null || po === null
    round1.push({
      tournament_id: tournamentId,
      round_number: 1,
      match_number: m + 1,
      player_x_id: px,
      player_o_id: po,
      status: isBye ? 'walkover' : 'pending',
      winner_user_id: isBye ? (px ?? po) : null,
      group_id: null,
    })
  }

  const allKO: typeof round1 = [...round1]
  for (let r = 2; r <= totalRounds; r++) {
    for (let m = 1; m <= bracketSize / Math.pow(2, r); m++) {
      allKO.push({
        tournament_id: tournamentId,
        round_number: r,
        match_number: m,
        player_x_id: null,
        player_o_id: null,
        status: 'pending',
        winner_user_id: null,
        group_id: null,
      })
    }
  }

  const { error: insertError } = await admin.from('caro_tournament_matches').insert(allKO)
  if (insertError) return { error: insertError.message }

  for (const m of round1) {
    if (m.status === 'walkover' && m.winner_user_id) {
      await advanceWinner(admin, tournamentId, 1, m.match_number, m.winner_user_id)
    }
  }

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  revalidatePath(`/admin/caro/${tournamentId}`)
  return { success: true }
}

// ── advanceWinner ─────────────────────────────────────────────────────────────
export async function advanceWinner(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  round: number,
  matchNumber: number,
  winnerId: string,
): Promise<void> {
  const nextRound = round + 1
  const nextMatch = Math.ceil(matchNumber / 2)
  const isXSlot = matchNumber % 2 === 1

  const { data: nextMatchRow } = await admin
    .from('caro_tournament_matches')
    .select('id, player_x_id, player_o_id, status')
    .eq('tournament_id', tournamentId)
    .eq('round_number', nextRound)
    .eq('match_number', nextMatch)
    .maybeSingle()

  if (!nextMatchRow) return

  const slotField = isXSlot ? 'player_x_id' : 'player_o_id'
  const otherSlot = isXSlot ? nextMatchRow.player_o_id : nextMatchRow.player_x_id
  const newStatus: MatchStatus = otherSlot ? 'ready' : 'pending'

  await admin.from('caro_tournament_matches').update({
    [slotField]: winnerId,
    status: newStatus,
  }).eq('id', nextMatchRow.id)
}

// ── createMatchRoom ───────────────────────────────────────────────────────────
export async function createMatchRoom(matchId: string): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: match } = await admin
    .from('caro_tournament_matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'match_not_found' }
  if (!match.player_x_id || !match.player_o_id) return { error: 'players_not_assigned' }
  if (match.room_code) return { error: 'room_already_exists' }

  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const genCode = () => Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')

  let roomCode = genCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from('caro_rooms').select('id').eq('room_code', roomCode).maybeSingle()
    if (!data) break
    roomCode = genCode()
  }

  const board = Array(225).fill(null)
  const { error: roomError } = await admin.from('caro_rooms').insert({
    room_code: roomCode,
    player_x: match.player_x_id,
    player_o: match.player_o_id,
    board,
    status: 'playing',
    current_turn: 'X',
  })

  if (roomError) return { error: roomError.message }

  const { error: matchError } = await admin.from('caro_tournament_matches').update({
    room_code: roomCode,
    status: 'playing',
    started_at: new Date().toISOString(),
  }).eq('id', matchId)

  if (matchError) return { error: matchError.message }

  revalidatePath(`/games/caro/tournaments/${match.tournament_id}`)
  revalidatePath(`/admin/caro/${match.tournament_id}`)
  return { success: true }
}

// ── setWalkover ───────────────────────────────────────────────────────────────
export async function setWalkover(matchId: string, winnerId: string): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: match } = await admin
    .from('caro_tournament_matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'match_not_found' }
  if (match.status === 'finished' || match.status === 'walkover') {
    return { error: 'match_already_finished' }
  }

  const loserId = match.player_x_id === winnerId ? match.player_o_id : match.player_x_id

  await admin.from('caro_tournament_matches').update({
    winner_user_id: winnerId,
    loser_user_id: loserId,
    status: 'walkover',
    finished_at: new Date().toISOString(),
  }).eq('id', matchId)

  // Pass group_id so group stage matches don't trigger bracket logic
  await handleMatchFinished(admin, match.tournament_id, match.round_number, match.match_number, winnerId, loserId, match.group_id)

  revalidatePath(`/games/caro/tournaments/${match.tournament_id}`)
  revalidatePath(`/admin/caro/${match.tournament_id}`)
  return { success: true }
}

// ── handleMatchFinished ───────────────────────────────────────────────────────
export async function handleMatchFinished(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  round: number,
  matchNumber: number,
  winnerId: string,
  loserId: string | null,
  groupId?: string | null,
): Promise<void> {
  // Group stage match — no elimination or bracket advancement
  if (groupId) return

  if (loserId) {
    await admin.from('caro_tournament_participants').update({
      status: 'eliminated',
      eliminated_at: new Date().toISOString(),
    }).eq('tournament_id', tournamentId).eq('user_id', loserId)
  }

  const { data: maxRoundData } = await admin
    .from('caro_tournament_matches')
    .select('round_number')
    .eq('tournament_id', tournamentId)
    .gte('round_number', 1)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const totalRounds = maxRoundData?.round_number ?? round

  if (round >= totalRounds) {
    await admin.from('caro_tournaments').update({
      champion_user_id: winnerId,
      status: 'finished',
      end_at: new Date().toISOString(),
    }).eq('id', tournamentId)

    await admin.from('caro_tournament_participants').update({
      status: 'champion',
    }).eq('tournament_id', tournamentId).eq('user_id', winnerId)
  } else {
    await advanceWinner(admin, tournamentId, round, matchNumber, winnerId)
  }
}

// ── getTournamentForAdmin ─────────────────────────────────────────────────────
export async function getTournamentForAdmin(tournamentId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const [
    { data: tournament },
    { data: participants },
    { data: matches },
    { data: groups },
    { data: groupMembers },
  ] = await Promise.all([
    admin.from('caro_tournaments').select('*').eq('id', tournamentId).single(),
    admin.from('caro_tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('joined_at'),
    admin.from('caro_tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number').order('match_number'),
    admin.from('caro_tournament_groups')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('group_order'),
    admin.from('caro_tournament_group_members')
      .select('*')
      .eq('tournament_id', tournamentId),
  ])

  return {
    tournament: tournament as CaroTournament | null,
    participants: (participants ?? []) as TournamentParticipant[],
    matches: (matches ?? []) as TournamentMatch[],
    groups: (groups ?? []) as TournamentGroup[],
    groupMembers: (groupMembers ?? []) as TournamentGroupMember[],
  }
}
