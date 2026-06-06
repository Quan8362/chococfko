'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
): Promise<{ ok?: boolean; roomId?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmedName = name.trim()
  if (!trimmedName) return { error: 'empty_name' }
  if (trimmedName.length > 50) return { error: 'name_too_long' }

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

  const { data: membersData, error: membersError } = await supabase
    .from('community_chat_room_members')
    .select('user_id, role, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })

  if (membersError) return { error: 'db_error' }

  const memberIds = (membersData ?? []).map(m => m.user_id as string)
  if (memberIds.length === 0) return { members: [] }

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', memberIds)

  const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
  for (const p of profilesData ?? []) {
    profileMap[p.id as string] = {
      display_name: p.display_name as string | null,
      avatar_url: p.avatar_url as string | null,
    }
  }

  const members: RoomMember[] = (membersData ?? []).map(m => ({
    user_id: m.user_id as string,
    role: m.role as 'owner' | 'admin' | 'member',
    joined_at: m.joined_at as string,
    display_name: profileMap[m.user_id as string]?.display_name ?? null,
    avatar_url: profileMap[m.user_id as string]?.avatar_url ?? null,
  }))

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

  const { data: existingMembers } = await supabase
    .from('community_chat_room_members')
    .select('user_id')
    .eq('room_id', roomId)

  const existingIds = new Set((existingMembers ?? []).map(m => m.user_id as string))

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${q}%`)
    .not('display_name', 'is', null)
    .limit(8)

  if (error) return { error: 'db_error' }

  const users: UserSearchResult[] = (data ?? [])
    .filter((p: { id: string }) => !existingIds.has(p.id))
    .map((p: { id: string; display_name: string; avatar_url: string | null }) => ({
      id: p.id,
      display_name: p.display_name,
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

  const { data: myMembership } = await admin
    .from('community_chat_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myMembership || !(['owner', 'admin'] as string[]).includes(myMembership.role as string)) {
    return { error: 'unauthorized' }
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
