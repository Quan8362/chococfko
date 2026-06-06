'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CaroTournament, TournamentParticipant, TournamentMatch,
  TournamentGroup, TournamentGroupMember,
} from '@/app/admin/caro/actions'

export type { CaroTournament, TournamentParticipant, TournamentMatch, TournamentGroup, TournamentGroupMember }
export type UserActionResult = { error: string } | { success: true } | null

// ── getTournaments ─────────────────────────────────────────────────────────────
export async function getTournaments(filter?: string): Promise<CaroTournament[]> {
  const admin = createAdminClient()
  let query = admin.from('caro_tournaments').select('*').eq('is_public', true)

  if (filter === 'open') query = query.eq('status', 'registration_open')
  else if (filter === 'active') query = query.eq('status', 'in_progress')
  else if (filter === 'finished') query = query.eq('status', 'finished')

  const { data } = await query.order('created_at', { ascending: false })
  return (data ?? []) as CaroTournament[]
}

// ── getTournamentById ──────────────────────────────────────────────────────────
export async function getTournamentById(id: string) {
  const admin = createAdminClient()

  const [{ data: tournament }, { data: participants }, { data: matches }, { data: groups }, { data: groupMembers }] = await Promise.all([
    admin.from('caro_tournaments').select('*').eq('id', id).maybeSingle(),
    admin.from('caro_tournament_participants')
      .select('*')
      .eq('tournament_id', id)
      .order('joined_at'),
    admin.from('caro_tournament_matches')
      .select('*')
      .eq('tournament_id', id)
      .order('round_number').order('match_number'),
    admin.from('caro_tournament_groups')
      .select('*')
      .eq('tournament_id', id)
      .order('group_order'),
    admin.from('caro_tournament_group_members')
      .select('*')
      .eq('tournament_id', id),
  ])

  // Gather all user IDs to resolve display names
  const allUserIds = new Set<string>()
  ;(participants ?? []).forEach(p => allUserIds.add(p.user_id))
  ;(matches ?? []).forEach(m => {
    if (m.player_x_id) allUserIds.add(m.player_x_id)
    if (m.player_o_id) allUserIds.add(m.player_o_id)
    if (m.winner_user_id) allUserIds.add(m.winner_user_id)
  })
  if (tournament?.champion_user_id) allUserIds.add(tournament.champion_user_id)

  const nameMap: Record<string, string> = {}
  if (allUserIds.size > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', Array.from(allUserIds))
    profiles?.forEach(p => { if (p.display_name) nameMap[p.id] = p.display_name })
  }

  return {
    tournament: tournament as CaroTournament | null,
    participants: (participants ?? []) as TournamentParticipant[],
    matches: (matches ?? []) as TournamentMatch[],
    groups: (groups ?? []) as TournamentGroup[],
    groupMembers: (groupMembers ?? []) as TournamentGroupMember[],
    nameMap,
  }
}

// ── getMyParticipation ─────────────────────────────────────────────────────────
export async function getMyParticipation(tournamentId: string): Promise<TournamentParticipant | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('caro_tournament_participants')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', user.id)
    .maybeSingle()

  return data as TournamentParticipant | null
}

// ── joinTournament ─────────────────────────────────────────────────────────────
export async function joinTournament(tournamentId: string): Promise<UserActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: tournament } = await admin
    .from('caro_tournaments')
    .select('id, status, max_players')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return { error: 'tournament_not_found' }
  if (tournament.status !== 'registration_open') return { error: 'registration_closed' }

  // Check participant count
  const { count } = await admin
    .from('caro_tournament_participants')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .not('status', 'eq', 'withdrawn')

  if ((count ?? 0) >= tournament.max_players) return { error: 'tournament_full' }

  // Get display name from profile
  const { data: profile } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  const displayName = profile?.display_name || user.email?.split('@')[0] || 'Người chơi'

  const { error } = await admin.from('caro_tournament_participants').insert({
    tournament_id: tournamentId,
    user_id: user.id,
    display_name: displayName,
    status: 'registered',
  })

  if (error) {
    if (error.code === '23505') return { error: 'already_joined' }
    return { error: error.message }
  }

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  return { success: true }
}

// ── checkIn ────────────────────────────────────────────────────────────────────
export async function checkIn(tournamentId: string): Promise<UserActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: tournament } = await admin
    .from('caro_tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return { error: 'tournament_not_found' }
  if (!['registration_open', 'registration_closed'].includes(tournament.status)) {
    return { error: 'checkin_not_allowed' }
  }

  const { error } = await admin
    .from('caro_tournament_participants')
    .update({ status: 'checked_in' })
    .eq('tournament_id', tournamentId)
    .eq('user_id', user.id)
    .eq('status', 'registered')

  if (error) return { error: error.message }

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  return { success: true }
}

// ── leaveTournament ────────────────────────────────────────────────────────────
export async function leaveTournament(tournamentId: string): Promise<UserActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const admin = createAdminClient()
  const { data: tournament } = await admin
    .from('caro_tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return { error: 'tournament_not_found' }
  if (!['draft', 'registration_open'].includes(tournament.status)) {
    return { error: 'cannot_leave_after_closed' }
  }

  const { error } = await admin
    .from('caro_tournament_participants')
    .update({ status: 'withdrawn' })
    .eq('tournament_id', tournamentId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/games/caro/tournaments/${tournamentId}`)
  return { success: true }
}
