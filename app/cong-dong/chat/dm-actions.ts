'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications/user'

const DM_MSG_PAGE = 50

export type DmConversation = {
  id: string
  other_user_id: string
  other_display_name: string
  other_avatar_url: string | null
  last_message_at: string | null
  last_message_preview: string | null
}

export type DmKind = 'text' | 'image' | 'file' | 'audio'

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
  kind: DmKind
  attachment_url: string | null   // signed URL resolved server-side
  attachment_name: string | null
  attachment_mime: string | null
  attachment_size: number | null
  audio_duration: number | null
  reply_to_id: string | null
  reply_to_message: string | null
  reply_to_display_name: string | null
}

export type DmReactionItem = { emoji: string; count: number; hasMyReaction: boolean; users: string[] }
export type DmReactionsMap = Record<string, DmReactionItem[]>

// Reactions allowed in DMs — same set as group chat.
const DM_ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉'] as const

const DM_BUCKETS = ['community-chat-images', 'community-chat-files', 'community-chat-audio'] as const
type DmBucket = (typeof DM_BUCKETS)[number]

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
): Promise<{ messages?: DmMessage[]; reactions?: DmReactionsMap; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { data, error } = await supabase
    .from('community_dm_messages')
    .select('id, conversation_id, sender_id, display_name, avatar_url, message, is_deleted, created_at, edited_at, kind, attachment_bucket, attachment_path, attachment_mime, attachment_name, attachment_size, audio_duration, reply_to_id, reply_to_message, reply_to_display_name')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(DM_MSG_PAGE)

  if (error) return { error: error.message }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const messages: DmMessage[] = await Promise.all(rows.map(async (r) => {
    let attachment_url: string | null = null
    const bucket = r.attachment_bucket as string | null
    const path = r.attachment_path as string | null
    if (bucket && path) {
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 86400)
      attachment_url = signed?.signedUrl ?? null
    }
    return {
      id: r.id as string,
      conversation_id: r.conversation_id as string,
      sender_id: r.sender_id as string,
      display_name: r.display_name as string,
      avatar_url: (r.avatar_url as string | null) ?? null,
      message: (r.message as string) ?? '',
      is_deleted: r.is_deleted as boolean,
      created_at: r.created_at as string,
      edited_at: (r.edited_at as string | null) ?? null,
      kind: ((r.kind as DmKind) ?? 'text'),
      attachment_url,
      attachment_name: (r.attachment_name as string | null) ?? null,
      attachment_mime: (r.attachment_mime as string | null) ?? null,
      attachment_size: (r.attachment_size as number | null) ?? null,
      audio_duration: (r.audio_duration as number | null) ?? null,
      reply_to_id: (r.reply_to_id as string | null) ?? null,
      reply_to_message: (r.reply_to_message as string | null) ?? null,
      reply_to_display_name: (r.reply_to_display_name as string | null) ?? null,
    }
  }))

  const reactions = await loadDmReactions(supabase, conversationId, user.id)
  return { messages, reactions }
}

// Build the reactions map for a conversation (emoji → {count, mine, who}).
async function loadDmReactions(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  selfId: string,
): Promise<DmReactionsMap> {
  const { data } = await supabase
    .from('community_dm_reactions')
    .select('message_id, user_id, emoji')
    .eq('conversation_id', conversationId)
  const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[]
  if (rows.length === 0) return {}

  const actorIds = Array.from(new Set(rows.map(r => r.user_id)))
  const nameMap: Record<string, string> = {}
  if (actorIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', actorIds)
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) nameMap[p.id] = p.display_name
    }
  }

  const map: DmReactionsMap = {}
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = []
    const list = map[row.message_id]
    const existing = list.find(x => x.emoji === row.emoji)
    const name = nameMap[row.user_id] ?? null
    if (existing) {
      existing.count++
      if (row.user_id === selfId) existing.hasMyReaction = true
      if (name && !existing.users.includes(name)) existing.users.push(name)
    } else {
      list.push({ emoji: row.emoji, count: 1, hasMyReaction: row.user_id === selfId, users: name ? [name] : [] })
    }
  }
  return map
}

// Shared sender for image/file/audio DM messages.
async function sendDmAttachment(opts: {
  conversationId: string
  kind: Exclude<DmKind, 'text'>
  bucket: DmBucket
  path: string
  mime: string
  size: number
  name: string | null
  caption?: string
  duration?: number
}): Promise<{ ok?: boolean; error?: string; msgId?: string; createdAt?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  if (!DM_BUCKETS.includes(opts.bucket)) return { error: 'invalid' }
  if (!opts.path.startsWith(`${user.id}/`)) return { error: 'invalid_path' }
  if (opts.size <= 0 || opts.size > 12 * 1024 * 1024) return { error: 'invalid_size' }
  const caption = (opts.caption ?? '').trim().slice(0, 500)

  const { data: conv } = await supabase
    .from('community_dm_conversations')
    .select('id, user1_id, user2_id')
    .eq('id', opts.conversationId)
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .maybeSingle()
  if (!conv) return { error: 'forbidden' }

  const { data: profile } = await supabase
    .from('profiles').select('display_name, avatar_url').eq('id', user.id).single()
  const displayName =
    (profile as { display_name: string | null } | null)?.display_name || user.email?.split('@')[0] || 'Thành viên'

  const { data: newMsg, error } = await supabase
    .from('community_dm_messages')
    .insert({
      conversation_id: opts.conversationId,
      sender_id: user.id,
      display_name: displayName,
      avatar_url: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
      message: caption || '',
      kind: opts.kind,
      attachment_bucket: opts.bucket,
      attachment_path: opts.path,
      attachment_mime: opts.mime,
      attachment_name: opts.name,
      attachment_size: opts.size,
      audio_duration: opts.kind === 'audio' ? (opts.duration ?? null) : null,
    })
    .select('id, created_at')
    .single()

  if (error) return { error: error.message }
  const { id: msgId, created_at: createdAt } = newMsg as { id: string; created_at: string }

  const preview = opts.kind === 'image' ? '📷 Ảnh' : opts.kind === 'audio' ? '🎤 Tin nhắn thoại' : `📎 ${opts.name ?? 'File'}`
  await supabase
    .from('community_dm_conversations')
    .update({ last_message_at: createdAt, last_message_preview: (caption || preview).slice(0, 80) })
    .eq('id', opts.conversationId)

  const c = conv as { user1_id: string; user2_id: string }
  const recipientId = c.user1_id === user.id ? c.user2_id : c.user1_id
  // `?dm=` is a USER id everywhere (profile/listing "message" buttons + chat page
  // deep-link), so point the recipient at the sender, not the conversation id.
  await notifyUsers({
    recipientIds: [recipientId],
    type: 'dm',
    targetUrl: `/cong-dong/chat?dm=${user.id}`,
    actorId: user.id,
    actorName: displayName,
    actorAvatar: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
    push: { title: `${displayName} đã nhắn tin cho bạn`, body: preview, tag: `dm-${opts.conversationId}` },
  })

  return { ok: true, msgId, createdAt }
}

export async function sendDmImage(conversationId: string, path: string, mime: string, size: number, caption?: string) {
  return sendDmAttachment({ conversationId, kind: 'image', bucket: 'community-chat-images', path, mime, size, name: null, caption })
}

export async function sendDmFile(conversationId: string, path: string, mime: string, size: number, name: string) {
  const safeName = name ? name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_').slice(0, 200) : null
  return sendDmAttachment({ conversationId, kind: 'file', bucket: 'community-chat-files', path, mime, size, name: safeName })
}

export async function sendDmAudio(conversationId: string, path: string, mime: string, size: number, durationSec: number) {
  return sendDmAttachment({ conversationId, kind: 'audio', bucket: 'community-chat-audio', path, mime, size, name: null, duration: Math.max(0, Math.round(durationSec)) })
}

export async function sendDmMessage(
  conversationId: string,
  message: string,
  replyToId?: string,
): Promise<{ ok?: boolean; error?: string; msgId?: string; createdAt?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmed = message.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > 500) return { error: 'too_long' }

  const { data: conv } = await supabase
    .from('community_dm_conversations')
    .select('id, user1_id, user2_id')
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

  // Snapshot reply context (same conversation, not deleted).
  let replyToMessage: string | null = null
  let replyToDisplayName: string | null = null
  if (replyToId) {
    const { data: r } = await supabase
      .from('community_dm_messages')
      .select('message, display_name, is_deleted, conversation_id, kind')
      .eq('id', replyToId)
      .eq('conversation_id', conversationId)
      .maybeSingle()
    const rm = r as { message: string; display_name: string; is_deleted: boolean; kind: DmKind } | null
    if (rm && !rm.is_deleted) {
      replyToMessage =
        rm.kind === 'image' ? '📷 Ảnh'
        : rm.kind === 'audio' ? '🎤 Tin nhắn thoại'
        : rm.kind === 'file' ? '📎 File'
        : rm.message
      replyToDisplayName = rm.display_name
    }
  }

  const { data: newMsg, error } = await supabase
    .from('community_dm_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      display_name: displayName,
      avatar_url: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
      message: trimmed,
      reply_to_id: replyToId ?? null,
      reply_to_message: replyToMessage,
      reply_to_display_name: replyToDisplayName,
    })
    .select('id, created_at')
    .single()

  if (error) return { error: error.message }

  const { id: msgId, created_at: createdAt } = newMsg as { id: string; created_at: string }

  await supabase
    .from('community_dm_conversations')
    .update({ last_message_at: createdAt, last_message_preview: trimmed.slice(0, 80) })
    .eq('id', conversationId)

  // Notify the recipient (bell + OS push). `?dm=` is a USER id everywhere
  // (profile/listing "message" buttons + chat page deep-link), so point the
  // recipient at the sender, not the conversation id.
  const c = conv as { user1_id: string; user2_id: string }
  const recipientId = c.user1_id === user.id ? c.user2_id : c.user1_id
  await notifyUsers({
    recipientIds: [recipientId],
    type: 'dm',
    targetUrl: `/cong-dong/chat?dm=${user.id}`,
    actorId: user.id,
    actorName: displayName,
    actorAvatar: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
    push: { title: `${displayName} đã nhắn tin cho bạn`, body: trimmed.slice(0, 80), tag: `dm-${conversationId}` },
  })

  return { ok: true, msgId, createdAt }
}

// ── Delete (soft) one of your own DM messages ────────────────────────────────
export async function deleteDmMessage(
  messageId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { data: msg } = await supabase
    .from('community_dm_messages')
    .select('sender_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg) return { error: 'not_found' }
  if ((msg as { sender_id: string }).sender_id !== user.id) return { error: 'unauthorized' }

  // Service-role update so the soft-delete also reaches the other client via
  // realtime UPDATE (no per-row UPDATE policy needed).
  const admin = createAdminClient()
  const { error } = await admin
    .from('community_dm_messages')
    .update({ is_deleted: true })
    .eq('id', messageId)
  if (error) return { error: 'db_error' }
  return { ok: true }
}

// ── Edit one of your own DM text messages ────────────────────────────────────
export async function editDmMessage(
  messageId: string,
  newText: string,
): Promise<{ ok?: boolean; error?: string; editedAt?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmed = newText.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > 500) return { error: 'too_long' }

  const { data: original } = await supabase
    .from('community_dm_messages')
    .select('sender_id, created_at, kind, is_deleted')
    .eq('id', messageId)
    .maybeSingle()
  const o = original as { sender_id: string; created_at: string; kind: DmKind; is_deleted: boolean } | null
  if (!o) return { error: 'not_found' }
  if (o.sender_id !== user.id) return { error: 'unauthorized' }
  if (o.is_deleted) return { error: 'deleted' }
  if (o.kind !== 'text') return { error: 'cannot_edit' }
  if (Date.now() - new Date(o.created_at).getTime() > 10 * 60 * 1000) return { error: 'too_late' }

  const editedAt = new Date().toISOString()
  const admin = createAdminClient()
  const { error } = await admin
    .from('community_dm_messages')
    .update({ message: trimmed, edited_at: editedAt })
    .eq('id', messageId)
  if (error) return { error: 'db_error' }
  return { ok: true, editedAt }
}

// ── Toggle a reaction on a DM message ────────────────────────────────────────
export async function toggleDmReaction(
  messageId: string,
  emoji: string,
): Promise<{ ok?: boolean; removed?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  if (!(DM_ALLOWED_EMOJIS as readonly string[]).includes(emoji)) return { error: 'invalid_emoji' }

  // Resolve the conversation + membership from the message.
  const { data: msg } = await supabase
    .from('community_dm_messages')
    .select('conversation_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg) return { error: 'not_found' }
  const conversationId = (msg as { conversation_id: string }).conversation_id

  const { data: existing } = await supabase
    .from('community_dm_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('community_dm_reactions')
      .delete()
      .eq('id', (existing as { id: string }).id)
    if (error) return { error: 'db_error' }
    return { ok: true, removed: true }
  }

  const { error } = await supabase
    .from('community_dm_reactions')
    .insert({ message_id: messageId, conversation_id: conversationId, user_id: user.id, emoji })
  if (error) return { error: 'db_error' }
  return { ok: true }
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
