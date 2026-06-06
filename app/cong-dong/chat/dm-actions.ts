'use server'

import { createClient } from '@/lib/supabase/server'

const DM_MSG_PAGE = 50

export type DmConversation = {
  id: string
  other_user_id: string
  other_display_name: string
  other_avatar_url: string | null
  last_message_at: string | null
  last_message_preview: string | null
}

export type DmMessage = {
  id: string
  conversation_id: string
  sender_id: string
  display_name: string
  avatar_url: string | null
  message: string
  is_deleted: boolean
  created_at: string
  edited_at: string | null
}

export async function getOrCreateDmConversation(
  otherUserId: string,
): Promise<{ conversationId?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }
  if (user.id === otherUserId) return { error: 'same_user' }

  const [uid1, uid2] = [user.id, otherUserId].sort() as [string, string]

  const { data: existing } = await supabase
    .from('community_dm_conversations')
    .select('id')
    .eq('user1_id', uid1)
    .eq('user2_id', uid2)
    .maybeSingle()

  if (existing) return { conversationId: (existing as { id: string }).id }

  const { data: created, error } = await supabase
    .from('community_dm_conversations')
    .insert({ user1_id: uid1, user2_id: uid2 })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { conversationId: (created as { id: string }).id }
}

export async function getDmConversations(): Promise<{
  conversations?: DmConversation[]
  error?: string
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { data, error } = await supabase
    .from('community_dm_conversations')
    .select('id, user1_id, user2_id, last_message_at, last_message_preview')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(30)

  if (error) return { error: error.message }

  const rows = (data ?? []) as {
    id: string
    user1_id: string
    user2_id: string
    last_message_at: string | null
    last_message_preview: string | null
  }[]

  const otherIds = rows.map(r => r.user1_id === user.id ? r.user2_id : r.user1_id)

  let profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {}
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', otherIds)
    for (const p of profiles ?? []) {
      const prof = p as { id: string; display_name: string; avatar_url: string | null }
      profileMap[prof.id] = { display_name: prof.display_name, avatar_url: prof.avatar_url }
    }
  }

  const conversations: DmConversation[] = rows.map(r => {
    const otherId = r.user1_id === user.id ? r.user2_id : r.user1_id
    const profile = profileMap[otherId]
    return {
      id: r.id,
      other_user_id: otherId,
      other_display_name: profile?.display_name ?? 'Thành viên',
      other_avatar_url: profile?.avatar_url ?? null,
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
    }
  })

  return { conversations }
}

export async function getDmMessages(
  conversationId: string,
): Promise<{ messages?: DmMessage[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { data, error } = await supabase
    .from('community_dm_messages')
    .select('id, conversation_id, sender_id, display_name, avatar_url, message, is_deleted, created_at, edited_at')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(DM_MSG_PAGE)

  if (error) return { error: error.message }
  return { messages: (data ?? []) as DmMessage[] }
}

export async function sendDmMessage(
  conversationId: string,
  message: string,
): Promise<{ ok?: boolean; error?: string; msgId?: string; createdAt?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmed = message.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > 500) return { error: 'too_long' }

  const { data: conv } = await supabase
    .from('community_dm_conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .maybeSingle()

  if (!conv) return { error: 'forbidden' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName =
    (profile as { display_name: string | null } | null)?.display_name ||
    user.email?.split('@')[0] ||
    'Thành viên'

  const { data: newMsg, error } = await supabase
    .from('community_dm_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      display_name: displayName,
      avatar_url: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
      message: trimmed,
    })
    .select('id, created_at')
    .single()

  if (error) return { error: error.message }

  const { id: msgId, created_at: createdAt } = newMsg as { id: string; created_at: string }

  await supabase
    .from('community_dm_conversations')
    .update({ last_message_at: createdAt, last_message_preview: trimmed.slice(0, 80) })
    .eq('id', conversationId)

  return { ok: true, msgId, createdAt }
}

export async function searchUsersForDm(
  query: string,
): Promise<{ users?: { id: string; display_name: string; avatar_url: string | null }[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  if (query.trim().length < 2) return { users: [] }

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${query.trim()}%`)
    .not('id', 'eq', user.id)
    .not('display_name', 'is', null)
    .limit(10)

  return {
    users: (data ?? []) as { id: string; display_name: string; avatar_url: string | null }[],
  }
}
