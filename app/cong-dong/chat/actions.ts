'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'

const RATE_LIMIT_COUNT = 5
const RATE_LIMIT_SECONDS = 60

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉'] as const

export type UserSuggestion = {
  id: string
  display_name: string
  avatar_url: string | null
}

export async function sendMessage(
  message: string,
  roomId: string,
  mentionedUserIds?: string[],
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

  // Resolve display names for mentioned users
  const safeIds = (mentionedUserIds ?? []).filter(id => id !== user.id)
  let mentionedNames: string[] = []
  if (safeIds.length > 0) {
    const { data: mentionedProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', safeIds)
    mentionedNames = (mentionedProfiles ?? [])
      .map(p => p.display_name as string | null)
      .filter((n): n is string => Boolean(n))
  }

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
      mentioned_names: mentionedNames,
      reply_to_id: replyToId ?? null,
      reply_to_message: replyToMessage,
      reply_to_display_name: replyToDisplayName,
    })
    .select('id, created_at')
    .single()

  if (insertError || !newMsg) return { error: 'db_error' }

  const { id: msgId, created_at: createdAt } = newMsg as { id: string; created_at: string }

  // Insert mention records (non-blocking — failure doesn't abort message)
  if (safeIds.length > 0) {
    const mentionRows = safeIds.map(uid => ({
      message_id: msgId,
      mentioned_user_id: uid,
      mentioned_by: user.id,
      room_id: roomId,
    }))
    await supabase.from('community_chat_mentions').insert(mentionRows)
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

  // Accept any emoji (1–20 chars covers all ZWJ sequences and flags)
  if (!emoji || emoji.length > 20) return { error: 'invalid_emoji' }

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
    const { error } = await supabase
      .from('community_chat_reactions')
      .insert({ message_id: messageId, user_id: user.id, emoji })
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

  const safeIds = (mentionedUserIds ?? []).filter(id => id !== user.id)
  let mentionedNames: string[] = []
  if (safeIds.length > 0) {
    const { data: mentionedProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', safeIds)
    mentionedNames = (mentionedProfiles ?? [])
      .map(p => p.display_name as string | null)
      .filter((n): n is string => Boolean(n))
  }

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
      mentioned_names: mentionedNames,
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
    await supabase.from('community_chat_mentions').insert(mentionRows)
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

  const safeIds = (mentionedUserIds ?? []).filter(id => id !== user.id)
  let mentionedNames: string[] = []
  if (safeIds.length > 0) {
    const { data: mentionedProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', safeIds)
    mentionedNames = (mentionedProfiles ?? [])
      .map(p => p.display_name as string | null)
      .filter((n): n is string => Boolean(n))
  }

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
      mentioned_names: mentionedNames,
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
    await supabase.from('community_chat_mentions').insert(mentionRows)
  }

  return { ok: true, msgId: (newMsg as { id: string }).id }
}
