import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import ChatClient from './ChatClient'

export const metadata = { title: 'Chat cộng đồng · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export type Room = {
  id: string
  key: string | null
  name: string
  sort_order: number
  is_private: boolean
  created_by: string | null
  avatar_url: string | null
}

export type ChatMessage = {
  id: string
  user_id: string | null
  display_name: string
  avatar_url: string | null
  message: string
  is_deleted: boolean
  created_at: string
  room_id: string
  is_pinned: boolean
  pinned_at: string | null
  pinned_by: string | null
  mentioned_user_ids: string[] | null
  mentioned_names: string[] | null
  reply_to_id: string | null
  reply_to_message: string | null
  reply_to_display_name: string | null
  has_attachment: boolean
  edited_at: string | null
  attachments?: ChatAttachment[] | null
}

export type ReactionItem = { emoji: string; count: number; hasMyReaction: boolean }
export type ReactionsMap = Record<string, ReactionItem[]>

export type ChatAttachment = {
  id: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  file_size: number
  file_name: string | null
}

const MSG_SELECT =
  'id, user_id, display_name, avatar_url, message, is_deleted, created_at, room_id, is_pinned, pinned_at, pinned_by, mentioned_user_ids, mentioned_names, reply_to_id, reply_to_message, reply_to_display_name, has_attachment, edited_at, attachments:community_chat_attachments(id, storage_bucket, storage_path, mime_type, file_size, file_name)'

function buildReactionsMap(
  rows: { message_id: string; user_id: string; emoji: string }[],
  userId: string,
): ReactionsMap {
  const map: ReactionsMap = {}
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = []
    const existing = map[row.message_id].find(r => r.emoji === row.emoji)
    if (existing) {
      existing.count++
      if (row.user_id === userId) existing.hasMyReaction = true
    } else {
      map[row.message_id].push({ emoji: row.emoji, count: 1, hasMyReaction: row.user_id === userId })
    }
  }
  return map
}

export default async function CongDongChatPage({
  searchParams,
}: {
  searchParams: { room?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/dang-nhap')

  const [isAdmin, profileResult, roomsResult] = await Promise.all([
    checkIsAdmin(),
    supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
    supabase
      .from('community_chat_rooms')
      .select('id, key, name, sort_order, is_private, created_by, avatar_url')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  const rooms = (roomsResult.data ?? []) as Room[]

  // Fetch user's membership in private rooms
  const { data: membershipsData } = await supabase
    .from('community_chat_room_members')
    .select('room_id, role')
    .eq('user_id', user.id)

  const myMembershipMap: Record<string, { role: 'owner' | 'admin' | 'member' }> = {}
  for (const m of membershipsData ?? []) {
    myMembershipMap[m.room_id as string] = { role: m.role as 'owner' | 'admin' | 'member' }
  }

  const initialRoomKey = searchParams.room ?? 'general'
  const initialRoom = rooms.find((r) => r.key === initialRoomKey || r.id === initialRoomKey) ?? rooms[0]

  let initialMessages: ChatMessage[] = []
  let initialPinnedMessages: ChatMessage[] = []
  let initialReactions: ReactionsMap = {}

  if (initialRoom) {
    const [msgResult, pinnedResult] = await Promise.all([
      supabase
        .from('community_chat_messages')
        .select(MSG_SELECT)
        .eq('room_id', initialRoom.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('community_chat_messages')
        .select(MSG_SELECT)
        .eq('room_id', initialRoom.id)
        .eq('is_pinned', true)
        .eq('is_deleted', false)
        .order('pinned_at', { ascending: true }),
    ])

    initialMessages = ((msgResult.data ?? []) as ChatMessage[]).reverse()
    initialPinnedMessages = (pinnedResult.data ?? []) as ChatMessage[]

    const messageIds = initialMessages.map(m => m.id)
    if (messageIds.length > 0) {
      const { data: reactionsData } = await supabase
        .from('community_chat_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messageIds)
      initialReactions = buildReactionsMap(
        (reactionsData ?? []) as { message_id: string; user_id: string; emoji: string }[],
        user.id,
      )
    }
  }

  const displayName =
    profileResult.data?.display_name ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Thành viên'

  return (
    <ChatClient
      userId={user.id}
      displayName={displayName}
      avatarUrl={profileResult.data?.avatar_url ?? null}
      isAdmin={isAdmin}
      rooms={rooms}
      initialRoomId={initialRoom?.id ?? ''}
      initialRoomKey={initialRoom?.key ?? 'general'}
      initialMessages={initialMessages}
      initialPinnedMessages={initialPinnedMessages}
      initialReactions={initialReactions}
      myMembershipMap={myMembershipMap}
    />
  )
}
