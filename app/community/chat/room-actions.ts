'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { isInternalMember } from '@/lib/access-server'

// Active internal member ids among a candidate list (service-role lookup).
async function activeInternalIds(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await admin
    .from('internal_members')
    .select('user_id')
    .in('user_id', ids)
    .eq('status', 'active')
  return new Set((data ?? []).map((r) => r.user_id as string))
}

export type RoomMember = {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  display_name: string | null
  avatar_url: string | null
}

export type UserSearchResult = {
  id: string
  display_name: string
  avatar_url: string | null
}

export async function createRoom(
  name: string,
  description?: string,
  scope?: string,
): Promise<{ ok?: boolean; roomId?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmedName = name.trim()
  if (!trimmedName) return { error: 'empty_name' }
  if (trimmedName.length > 50) return { error: 'name_too_long' }

  // Only an active internal member / admin may create an internal group. A forged
  // fko_internal from a community user is rejected (never silently created).
  let communityScope: 'community' | 'fko_internal' = 'community'
  if (scope === 'fko_internal') {
    const [internal, admin2] = await Promise.all([isInternalMember(user.id), checkIsAdmin()])
    if (!internal && !admin2) return { error: 'unauthorized' }
    communityScope = 'fko_internal'
  }

  const admin = createAdminClient()

  const roomKey = `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const { data: room, error: roomError } = await admin
    .from('community_chat_rooms')
    .insert({
      key: roomKey,
      name: trimmedName,
      description: description?.trim() || null,
      is_private: true,
      is_active: true,
      created_by: user.id,
      sort_order: 999,
      community_scope: communityScope,
    })
    .select('id')
    .single()

  if (roomError || !room) return { error: 'db_error' }

  const { error: memberError } = await admin
    .from('community_chat_room_members')
    .insert({ room_id: room.id, user_id: user.id, role: 'owner', added_by: user.id })

  if (memberError) {
    await admin.from('community_chat_rooms').delete().eq('id', room.id)
    return { error: 'db_error' }
  }

  return { ok: true, roomId: room.id }
}

export async function getRoomMembers(roomId: string): Promise<{
  members?: RoomMember[]
  error?: string
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()

  const { data: membersData, error: membersError } = await admin
    .from('community_chat_room_members')
    .select('user_id, role, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })

  if (membersError) return { error: 'db_error' }

  const memberIds = (membersData ?? []).map(m => m.user_id as string)
  if (memberIds.length === 0) return { members: [] }

  const [{ data: profilesData }, { data: { users: authUsers } }] = await Promise.all([
    admin.from('profiles').select('id, display_name, avatar_url').in('id', memberIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = new Map<string, string>(
    authUsers.map(u => [u.id, u.email ?? ''])
  )

  const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
  for (const p of profilesData ?? []) {
    profileMap[p.id as string] = {
      display_name: p.display_name as string | null,
      avatar_url: p.avatar_url as string | null,
    }
  }

  const members: RoomMember[] = (membersData ?? []).map(m => {
    const uid = m.user_id as string
    const profile = profileMap[uid]
    const emailPrefix = emailMap.get(uid)?.split('@')[0] ?? null
    return {
      user_id: uid,
      role: m.role as 'owner' | 'admin' | 'member',
      joined_at: m.joined_at as string,
      display_name: profile?.display_name || emailPrefix,
      avatar_url: profile?.avatar_url ?? null,
    }
  })

  return { members }
}

export async function searchUsersForRoom(
  query: string,
  roomId: string,
): Promise<{ users?: UserSearchResult[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const q = query.trim()
  if (!q) return { users: [] }

  const admin = createAdminClient()

  const [{ data: existingMembers }, { data: { users: authUsers } }, { data: roomRow }] = await Promise.all([
    admin.from('community_chat_room_members').select('user_id').eq('room_id', roomId),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('community_chat_rooms').select('community_scope').eq('id', roomId).maybeSingle(),
  ])

  const roomIsInternal = (roomRow as { community_scope?: string } | null)?.community_scope === 'fko_internal'

  const existingIds = new Set((existingMembers ?? []).map(m => m.user_id as string))
  const qLower = q.toLowerCase()

  // Build email map for all auth users
  const emailMap = new Map<string, string>(
    authUsers.map(u => [u.id, u.email ?? ''])
  )

  // IDs whose email/email-prefix matches the query
  const emailMatchIds = authUsers
    .filter(u => {
      const email = u.email?.toLowerCase() ?? ''
      return email.includes(qLower) || email.split('@')[0].includes(qLower)
    })
    .map(u => u.id)

  // Search profiles by display_name (catches real names like "Đặng Thu Hà" → "đặng")
  const { data: nameMatches } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${q}%`)
    .limit(20)

  const nameMatchIds = new Set((nameMatches ?? []).map(p => p.id))

  // Fetch profiles for email matches not already in name matches
  const extraIds = emailMatchIds.filter(id => !nameMatchIds.has(id))
  let extraProfiles: { id: string; display_name: string | null; avatar_url: string | null }[] = []
  if (extraIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', extraIds)
      .limit(20)
    extraProfiles = (data ?? [])
  }

  const combined = [...(nameMatches ?? []), ...extraProfiles]
  const seen = new Set<string>()

  let candidates = combined.filter(p => {
    if (existingIds.has(p.id) || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  // For an internal group, only active internal members are eligible — a
  // community-only user must never be searchable as a candidate participant.
  if (roomIsInternal) {
    const internalIds = await activeInternalIds(admin, candidates.map(p => p.id))
    candidates = candidates.filter(p => internalIds.has(p.id))
  }

  const users: UserSearchResult[] = candidates
    .slice(0, 8)
    .map(p => ({
      id: p.id,
      display_name: p.display_name || emailMap.get(p.id)?.split('@')[0] || '?',
      avatar_url: p.avatar_url,
    }))

  return { users }
}

export async function addMembersToRoom(
  roomId: string,
  userIds: string[],
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }
  if (userIds.length === 0) return { ok: true }

  const admin = createAdminClient()

  const [{ data: myMembership }, { data: roomRow }] = await Promise.all([
    admin
      .from('community_chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle(),
    admin.from('community_chat_rooms').select('community_scope').eq('id', roomId).maybeSingle(),
  ])

  if (!myMembership || !(['owner', 'admin'] as string[]).includes(myMembership.role as string)) {
    return { error: 'unauthorized' }
  }

  // Internal group: every added participant must be an active internal member.
  if ((roomRow as { community_scope?: string } | null)?.community_scope === 'fko_internal') {
    const internalIds = await activeInternalIds(admin, userIds)
    if (userIds.some(uid => !internalIds.has(uid))) return { error: 'unauthorized' }
  }

  const rows = userIds.map(uid => ({
    room_id: roomId,
    user_id: uid,
    role: 'member',
    added_by: user.id,
  }))

  const { error } = await admin.from('community_chat_room_members').insert(rows)
  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function removeMemberFromRoom(
  roomId: string,
  targetUserId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()

  const { data: myMembership } = await admin
    .from('community_chat_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()

  const isSelf = targetUserId === user.id
  const isOwnerOrAdmin = myMembership && (['owner', 'admin'] as string[]).includes(myMembership.role as string)

  if (!isSelf && !isOwnerOrAdmin) return { error: 'unauthorized' }
  if (isSelf && myMembership?.role === 'owner') return { error: 'owner_cannot_leave' }

  if (!isSelf) {
    const { data: target } = await admin
      .from('community_chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', targetUserId)
      .maybeSingle()
    if (!target) return { error: 'not_found' }
    if (target.role === 'owner') return { error: 'unauthorized' }
    if (myMembership?.role === 'admin' && target.role === 'admin') return { error: 'unauthorized' }
  }

  const { error } = await admin
    .from('community_chat_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', targetUserId)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function updateMemberRole(
  roomId: string,
  targetUserId: string,
  newRole: 'admin' | 'member',
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()

  const { data: myMembership } = await admin
    .from('community_chat_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (myMembership?.role !== 'owner') return { error: 'unauthorized' }
  if (targetUserId === user.id) return { error: 'cannot_change_own_role' }

  const { error } = await admin
    .from('community_chat_room_members')
    .update({ role: newRole })
    .eq('room_id', roomId)
    .eq('user_id', targetUserId)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function updateRoomAvatar(
  roomId: string,
  avatarUrl: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()

  // Only private rooms can have avatars changed by members
  const { data: room } = await admin
    .from('community_chat_rooms')
    .select('is_private')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) return { error: 'not_found' }
  if (!room.is_private) return { error: 'unauthorized' }

  // Any member of the private room can update avatar
  const { data: myMembership } = await admin
    .from('community_chat_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myMembership) return { error: 'unauthorized' }

  const { error } = await admin
    .from('community_chat_rooms')
    .update({ avatar_url: avatarUrl })
    .eq('id', roomId)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function deleteRoom(
  roomId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()

  const { data: myMembership } = await admin
    .from('community_chat_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (myMembership?.role !== 'owner') return { error: 'unauthorized' }

  const { data: room } = await admin
    .from('community_chat_rooms')
    .select('is_private')
    .eq('id', roomId)
    .maybeSingle()

  if (!(room as { is_private?: boolean } | null)?.is_private) return { error: 'unauthorized' }

  // Delete child records in correct dependency order to satisfy FK constraints
  const { data: msgs } = await admin
    .from('community_chat_messages')
    .select('id')
    .eq('room_id', roomId)
  const msgIds = (msgs ?? []).map((m: { id: string }) => m.id as string)

  if (msgIds.length > 0) {
    await admin.from('community_chat_reactions').delete().in('message_id', msgIds)
    await admin.from('community_chat_reports').delete().in('message_id', msgIds)
  }

  await admin.from('community_chat_mentions').delete().eq('room_id', roomId)
  await admin.from('community_chat_attachments').delete().eq('room_id', roomId)
  await admin.from('community_chat_messages').delete().eq('room_id', roomId)
  await admin.from('community_chat_room_members').delete().eq('room_id', roomId)

  const { error } = await admin.from('community_chat_rooms').delete().eq('id', roomId)
  if (error) return { error: 'db_error' }
  return { ok: true }
}
