'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push/send'

const RATE_LIMIT_COUNT = 5
const RATE_LIMIT_SECONDS = 60

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉'] as const

export type UserSuggestion = {
  id: string
  display_name: string
  avatar_url: string | null
}

// Background/closed-tab push to mentioned users. Best-effort; resolves the room
// key so the click deep-links to the right room.
async function sendMentionPush(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  senderName: string,
  text: string,
  roomId: string,
  msgId: string,
): Promise<void> {
  const { data: roomRow } = await supabase
    .from('community_chat_rooms').select('key').eq('id', roomId).maybeSingle()
  const roomParam = (roomRow?.key as string | undefined) ?? roomId
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 80) || '💬'
  await sendPushToUsers(userIds, {
    title: `${senderName} đã nhắc đến bạn`,
    body: preview,
    url: `/cong-dong/chat?room=${roomParam}&msg=${msgId}`,
    tag: `mention-${msgId}`,
  })
}

// Resolve mentions to (id, name) pairs. Trusts the names the client inserted —
// they match the @text and use the email-prefix fallback for users without a
// display_name (which profiles.display_name alone would miss, dropping the
// mention entirely). Then adds manually-typed @tokens that match a display_name.
async function resolveMentions(
  supabase: ReturnType<typeof createClient>,
  text: string,
  selfId: string,
  mentionedUserIds?: string[],
  mentionedNames?: string[],
): Promise<{ ids: string[]; names: string[] }> {
  const idToName = new Map<string, string>()
  const cIds = mentionedUserIds ?? []
  const cNames = mentionedNames ?? []
  cIds.forEach((id, i) => {
    if (id && id !== selfId && cNames[i]) idToName.set(id, cNames[i])
  })

  const atTokens = Array.from(new Set((text.match(/@(\S+)/g) ?? []).map(t => t.slice(1))))
  const known = new Set(idToName.values())
  const unknown = atTokens.filter(tk => !known.has(tk))
  if (unknown.length > 0) {
    const { data: atProfiles } = await supabase
      .from('profiles').select('id, display_name').in('display_name', unknown)
    for (const p of atProfiles ?? []) {
      const id = p.id as string
      const dn = p.display_name as string | null
      if (id !== selfId && dn && !idToName.has(id)) idToName.set(id, dn)
    }
  }

  const ids = Array.from(idToName.keys())
  return { ids, names: ids.map(id => idToName.get(id) as string) }
}

export async function sendMessage(
  message: string,
  roomId: string,
  mentionedUserIds?: string[],
  mentionedNames?: string[],
  replyToId?: string,
): Promise<{ ok?: boolean; error?: string; msgId?: string; createdAt?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmed = message.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > 500) return { error: 'too_long' }
  if (!roomId) return { error: 'no_room' }

  const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
  const { count } = await supabase
    .from('community_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)

  if ((count ?? 0) >= RATE_LIMIT_COUNT) return { error: 'rate_limit' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName =
    profile?.display_name ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Thành viên'

  const { ids: safeIds, names: resolvedNames } =
    await resolveMentions(supabase, trimmed, user.id, mentionedUserIds, mentionedNames)

  // Snapshot reply context — validates same room + not deleted
  let replyToMessage: string | null = null
  let replyToDisplayName: string | null = null
  if (replyToId) {
    const { data: replyMsg } = await supabase
      .from('community_chat_messages')
      .select('message, display_name, is_deleted, room_id, has_attachment')
      .eq('id', replyToId)
      .eq('room_id', roomId)
      .single()
    if (replyMsg && !replyMsg.is_deleted) {
      const hasAtt = (replyMsg as Record<string, unknown>).has_attachment === true
      const rawMsg = replyMsg.message as string
      if (!hasAtt) replyToMessage = rawMsg
      else if (rawMsg === '[image]') replyToMessage = '📷 Ảnh'
      else if (rawMsg === '[file]') replyToMessage = '📎 File'
      else replyToMessage = rawMsg.length > 0 ? rawMsg : '📎 File'
      replyToDisplayName = replyMsg.display_name as string
    }
    // If not found or deleted: reply_to_id is stored but snapshot is null
    // UI will show "Tin nhắn đã bị xóa" in that case
  }

  const { data: newMsg, error: insertError } = await supabase
    .from('community_chat_messages')
    .insert({
      user_id: user.id,
      room_id: roomId,
      display_name: displayName,
      avatar_url: profile?.avatar_url ?? null,
      message: trimmed,
      mentioned_user_ids: safeIds,
      mentioned_names: resolvedNames,
      reply_to_id: replyToId ?? null,
      reply_to_message: replyToMessage,
      reply_to_display_name: replyToDisplayName,
    })
    .select('id, created_at')
    .single()

  if (insertError || !newMsg) return { error: 'db_error' }

  const { id: msgId, created_at: createdAt } = newMsg as { id: string; created_at: string }

  // Insert mention records via admin client to bypass RLS
  if (safeIds.length > 0) {
    const mentionRows = safeIds.map(uid => ({
      message_id: msgId,
      mentioned_user_id: uid,
      mentioned_by: user.id,
      room_id: roomId,
    }))
    const admin = createAdminClient()
    const { error: mentionErr } = await admin.from('community_chat_mentions').insert(mentionRows)
    if (mentionErr) console.error('[sendMessage] mention insert failed:', mentionErr.message)

    await sendMentionPush(supabase, safeIds, displayName, trimmed, roomId, msgId)
  }

  return { ok: true, msgId, createdAt }
}

export async function deleteMessage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const isAdmin = await checkIsAdmin()

  if (!isAdmin) {
    // Allow users to delete their own messages
    const { data: msg } = await supabase
      .from('community_chat_messages')
      .select('user_id')
      .eq('id', id)
      .maybeSingle()
    if (!msg || msg.user_id !== user.id) return { error: 'unauthorized' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_chat_messages')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function reportMessage(
  messageId: string,
  reason?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { error } = await supabase.from('community_chat_reports').insert({
    message_id: messageId,
    reporter_id: user.id,
    reason: reason ?? null,
  })

  if (error) {
    if (error.code === '23505') return { error: 'already_reported' }
    return { error: 'db_error' }
  }
  return { ok: true }
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<{ ok?: boolean; removed?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  // Only allow the DB-enforced allowed list
  if (!(ALLOWED_EMOJIS as readonly string[]).includes(emoji)) return { error: 'invalid_emoji' }

  const { data: existing } = await supabase
    .from('community_chat_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('community_chat_reactions')
      .delete()
      .eq('id', existing.id)
    if (error) return { error: 'db_error' }
    return { ok: true, removed: true }
  } else {
    const { data: msg } = await supabase
      .from('community_chat_messages')
      .select('room_id')
      .eq('id', messageId)
      .single()
    const { error } = await supabase
      .from('community_chat_reactions')
      .insert({ message_id: messageId, user_id: user.id, emoji, room_id: msg?.room_id ?? null })
    if (error) return { error: 'db_error' }
    return { ok: true }
  }
}

export async function pinMessage(messageId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return { error: 'unauthorized' }

  const admin = createAdminClient()

  const { data: msg } = await admin
    .from('community_chat_messages')
    .select('room_id')
    .eq('id', messageId)
    .single()

  if (!msg) return { error: 'not_found' }

  const { count } = await admin
    .from('community_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', msg.room_id)
    .eq('is_pinned', true)
    .eq('is_deleted', false)

  if ((count ?? 0) >= 3) return { error: 'max_pins' }

  const { error } = await admin
    .from('community_chat_messages')
    .update({ is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id })
    .eq('id', messageId)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function unpinMessage(messageId: string): Promise<{ ok?: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return { error: 'unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_chat_messages')
    .update({ is_pinned: false, pinned_at: null, pinned_by: null })
    .eq('id', messageId)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function editMessage(
  messageId: string,
  newText: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmed = newText.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > 500) return { error: 'too_long' }

  const { data: original } = await supabase
    .from('community_chat_messages')
    .select('user_id, created_at, has_attachment, is_deleted')
    .eq('id', messageId)
    .single()

  if (!original) return { error: 'not_found' }
  if (original.user_id !== user.id) return { error: 'unauthorized' }
  if (original.is_deleted) return { error: 'deleted' }
  if (original.has_attachment) return { error: 'cannot_edit_image' }

  const ageMs = Date.now() - new Date(original.created_at as string).getTime()
  if (ageMs > 10 * 60 * 1000) return { error: 'too_late' }

  const { error } = await supabase
    .from('community_chat_messages')
    .update({ message: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('user_id', user.id)

  if (error) return { error: 'db_error' }
  return { ok: true }
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

const ALLOWED_FILE_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
] as const

const FILE_STORAGE_BUCKET = 'community-chat-files'
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function saveImageMessage(
  storagePath: string,
  fileName: string | null,
  mimeType: string,
  fileSize: number,
  roomId: string,
  caption?: string,
  mentionedUserIds?: string[],
  mentionedNames?: string[],
  replyToId?: string,
): Promise<{ ok?: boolean; error?: string; msgId?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) return { error: 'invalid_mime' }
  if (fileSize <= 0 || fileSize > 3 * 1024 * 1024) return { error: 'invalid_size' }
  if (!storagePath.startsWith(`${user.id}/`)) return { error: 'invalid_path' }
  if (!roomId) return { error: 'no_room' }

  const trimmedCaption = caption?.trim() ?? ''
  if (trimmedCaption.length > 500) return { error: 'too_long' }

  const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
  const { count } = await supabase
    .from('community_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT_COUNT) return { error: 'rate_limit' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName =
    profile?.display_name ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Thành viên'

  const { ids: safeIds, names: resolvedNames } =
    await resolveMentions(supabase, trimmedCaption, user.id, mentionedUserIds, mentionedNames)

  let replyToMessage: string | null = null
  let replyToDisplayName: string | null = null
  if (replyToId) {
    const { data: replyMsg } = await supabase
      .from('community_chat_messages')
      .select('message, display_name, is_deleted, room_id, has_attachment')
      .eq('id', replyToId)
      .eq('room_id', roomId)
      .single()
    if (replyMsg && !replyMsg.is_deleted) {
      const hasAtt = (replyMsg as Record<string, unknown>).has_attachment === true
      const rawMsg = replyMsg.message as string
      if (!hasAtt) replyToMessage = rawMsg
      else if (rawMsg === '[image]') replyToMessage = '📷 Ảnh'
      else if (rawMsg === '[file]') replyToMessage = '📎 File'
      else replyToMessage = rawMsg.length > 0 ? rawMsg : '📎 File'
      replyToDisplayName = replyMsg.display_name as string
    }
  }

  const { data: newMsg, error: msgError } = await supabase
    .from('community_chat_messages')
    .insert({
      user_id: user.id,
      room_id: roomId,
      display_name: displayName,
      avatar_url: profile?.avatar_url ?? null,
      message: trimmedCaption || '[image]',
      mentioned_user_ids: safeIds,
      mentioned_names: resolvedNames,
      has_attachment: true,
      reply_to_id: replyToId ?? null,
      reply_to_message: replyToMessage,
      reply_to_display_name: replyToDisplayName,
    })
    .select('id')
    .single()

  if (msgError || !newMsg) return { error: 'db_error' }

  const { error: attError } = await supabase
    .from('community_chat_attachments')
    .insert({
      message_id: newMsg.id,
      user_id: user.id,
      room_id: roomId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
    })

  if (attError) {
    await supabase.from('community_chat_messages').delete().eq('id', newMsg.id)
    return { error: 'db_error' }
  }

  if (safeIds.length > 0) {
    const mentionRows = safeIds.map(uid => ({
      message_id: newMsg.id,
      mentioned_user_id: uid,
      mentioned_by: user.id,
      room_id: roomId,
    }))
    const admin = createAdminClient()
    const { error: mentionErr } = await admin.from('community_chat_mentions').insert(mentionRows)
    if (mentionErr) console.error('[saveImageMessage] mention insert failed:', mentionErr.message)

    await sendMentionPush(supabase, safeIds, displayName, trimmedCaption || '📷 Ảnh', roomId, (newMsg as { id: string }).id)
  }

  return { ok: true, msgId: (newMsg as { id: string }).id }
}

export async function saveFileMessage(
  storagePath: string,
  fileName: string | null,
  mimeType: string,
  fileSize: number,
  roomId: string,
  caption?: string,
  mentionedUserIds?: string[],
  mentionedNames?: string[],
  replyToId?: string,
): Promise<{ ok?: boolean; error?: string; msgId?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  if (!(ALLOWED_FILE_MIME as readonly string[]).includes(mimeType)) return { error: 'invalid_mime' }
  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) return { error: 'invalid_size' }
  if (!storagePath.startsWith(`${user.id}/`)) return { error: 'invalid_path' }
  if (!roomId) return { error: 'no_room' }

  const safeFileName = fileName
    ? fileName.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_').slice(0, 200)
    : null

  const trimmedCaption = caption?.trim() ?? ''
  if (trimmedCaption.length > 500) return { error: 'too_long' }

  const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
  const { count } = await supabase
    .from('community_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT_COUNT) return { error: 'rate_limit' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName =
    profile?.display_name ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Thành viên'

  const { ids: safeIds, names: resolvedNames } =
    await resolveMentions(supabase, trimmedCaption, user.id, mentionedUserIds, mentionedNames)

  let replyToMessage: string | null = null
  let replyToDisplayName: string | null = null
  if (replyToId) {
    const { data: replyMsg } = await supabase
      .from('community_chat_messages')
      .select('message, display_name, is_deleted, room_id, has_attachment')
      .eq('id', replyToId)
      .eq('room_id', roomId)
      .single()
    if (replyMsg && !replyMsg.is_deleted) {
      const hasAtt = (replyMsg as Record<string, unknown>).has_attachment === true
      const rawMsg = replyMsg.message as string
      if (!hasAtt) replyToMessage = rawMsg
      else if (rawMsg === '[image]') replyToMessage = '📷 Ảnh'
      else if (rawMsg === '[file]') replyToMessage = '📎 File'
      else replyToMessage = rawMsg.length > 0 ? rawMsg : '📎 File'
      replyToDisplayName = replyMsg.display_name as string
    }
  }

  const { data: newMsg, error: msgError } = await supabase
    .from('community_chat_messages')
    .insert({
      user_id: user.id,
      room_id: roomId,
      display_name: displayName,
      avatar_url: profile?.avatar_url ?? null,
      message: trimmedCaption || '[file]',
      mentioned_user_ids: safeIds,
      mentioned_names: resolvedNames,
      has_attachment: true,
      reply_to_id: replyToId ?? null,
      reply_to_message: replyToMessage,
      reply_to_display_name: replyToDisplayName,
    })
    .select('id')
    .single()

  if (msgError || !newMsg) return { error: 'db_error' }

  const { error: attError } = await supabase
    .from('community_chat_attachments')
    .insert({
      message_id: newMsg.id,
      user_id: user.id,
      room_id: roomId,
      storage_bucket: FILE_STORAGE_BUCKET,
      storage_path: storagePath,
      file_name: safeFileName,
      mime_type: mimeType,
      file_size: fileSize,
    })

  if (attError) {
    await supabase.from('community_chat_messages').delete().eq('id', newMsg.id)
    return { error: 'db_error' }
  }

  if (safeIds.length > 0) {
    const mentionRows = safeIds.map(uid => ({
      message_id: newMsg.id,
      mentioned_user_id: uid,
      mentioned_by: user.id,
      room_id: roomId,
    }))
    const admin = createAdminClient()
    const { error: mentionErr } = await admin.from('community_chat_mentions').insert(mentionRows)
    if (mentionErr) console.error('[saveFileMessage] mention insert failed:', mentionErr.message)

    await sendMentionPush(supabase, safeIds, displayName, trimmedCaption || '📎 File', roomId, (newMsg as { id: string }).id)
  }

  return { ok: true, msgId: (newMsg as { id: string }).id }
}

// ── Poll actions ──────────────────────────────────────────────────────────────

export async function createPoll(
  roomId: string,
  question: string,
  options: string[],
  allowMultiple: boolean,
): Promise<{ ok?: boolean; error?: string; msgId?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const trimmedQ = question.trim()
  if (!trimmedQ) return { error: 'poll_question_empty' }
  if (trimmedQ.length > 200) return { error: 'poll_question_too_long' }
  if (!roomId) return { error: 'no_room' }

  const validOpts = options.map(o => o.trim()).filter(Boolean)
  if (validOpts.length < 2) return { error: 'poll_min_options' }
  if (validOpts.length > 10) return { error: 'poll_max_options' }

  const { data: room } = await supabase
    .from('community_chat_rooms')
    .select('is_private, is_active')
    .eq('id', roomId)
    .maybeSingle()
  if (!room || !room.is_active) return { error: 'room_not_found' }

  if (room.is_private) {
    const { data: membership } = await supabase
      .from('community_chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return { error: 'not_member' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName =
    profile?.display_name ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Thanh vien'

  const admin = createAdminClient()

  const { data: newMsg, error: msgError } = await admin
    .from('community_chat_messages')
    .insert({
      user_id: user.id,
      room_id: roomId,
      display_name: displayName,
      avatar_url: profile?.avatar_url ?? null,
      message: trimmedQ.length > 100 ? trimmedQ.slice(0, 100) + '...' : trimmedQ,
      has_poll: true,
    })
    .select('id')
    .single()

  if (msgError || !newMsg) return { error: 'db_error' }
  const msgId = (newMsg as { id: string }).id

  const { data: newPoll, error: pollError } = await admin
    .from('community_chat_polls')
    .insert({
      room_id: roomId,
      message_id: msgId,
      created_by: user.id,
      question: trimmedQ,
      allow_multiple: allowMultiple,
    })
    .select('id')
    .single()

  if (pollError || !newPoll) {
    await admin.from('community_chat_messages').delete().eq('id', msgId)
    return { error: 'db_error' }
  }

  const optionRows = validOpts.map((text, idx) => ({
    poll_id: (newPoll as { id: string }).id,
    text,
    sort_order: idx,
  }))
  const { error: optError } = await admin
    .from('community_chat_poll_options')
    .insert(optionRows)

  if (optError) {
    await admin.from('community_chat_polls').delete().eq('id', (newPoll as { id: string }).id)
    await admin.from('community_chat_messages').delete().eq('id', msgId)
    return { error: 'db_error' }
  }

  return { ok: true, msgId }
}

export async function votePoll(
  pollId: string,
  optionId: string,
): Promise<{ ok?: boolean; removed?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { data: poll } = await supabase
    .from('community_chat_polls')
    .select('id, room_id, allow_multiple, is_closed')
    .eq('id', pollId)
    .maybeSingle()
  if (!poll) return { error: 'poll_not_found' }
  if (poll.is_closed) return { error: 'poll_closed' }

  const { data: room } = await supabase
    .from('community_chat_rooms')
    .select('is_private')
    .eq('id', poll.room_id)
    .maybeSingle()

  if (room?.is_private) {
    const { data: membership } = await supabase
      .from('community_chat_room_members')
      .select('user_id')
      .eq('room_id', poll.room_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return { error: 'not_member' }
  }

  const { data: existingVote } = await supabase
    .from('community_chat_poll_votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('option_id', optionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingVote) {
    const { error } = await supabase
      .from('community_chat_poll_votes')
      .delete()
      .eq('id', existingVote.id)
    if (error) return { error: 'db_error' }
    return { ok: true, removed: true }
  }

  if (!poll.allow_multiple) {
    await supabase
      .from('community_chat_poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', user.id)
  }

  const { error } = await supabase
    .from('community_chat_poll_votes')
    .insert({ poll_id: pollId, option_id: optionId, user_id: user.id })
  if (error) return { error: 'db_error' }
  return { ok: true }
}
