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
  has_poll?: boolean
  edited_at: string | null
  attachments?: ChatAttachment[] | null
}

export type ReactionItem = { emoji: string; count: number; hasMyReaction: boolean }
export type ReactionsMap = Record<string, ReactionItem[]>

export type PollVoter = {
  user_id: string
  display_name: string
  avatar_url: string | null
}
export type PollOption = {
  id: string
  text: string
  sort_order: number
  vote_count: number
  has_my_vote: boolean
  voters: PollVoter[]
}
export type PollData = {
  id: string
  question: string
  allow_multiple: boolean
  is_closed: boolean
  options: PollOption[]
  total_votes: number
  my_vote_option_ids: string[]
}
export type PollsMap = Record<string, PollData>

export type ChatAttachment = {
  id: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  file_size: number
  file_name: string | null
}

const MSG_SELECT =
  'id, user_id, display_name, avatar_url, message, is_deleted, created_at, room_id, is_pinned, pinned_at, pinned_by, mentioned_user_ids, mentioned_names, reply_to_id, reply_to_message, reply_to_display_name, has_attachment, has_poll, edited_at, attachments:community_chat_attachments(id, storage_bucket, storage_path, mime_type, file_size, file_name)'

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
  let initialPollsMap: PollsMap = {}

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

    // Fetch polls for messages that have polls
    const pollMessageIds = initialMessages.filter(m => m.has_poll).map(m => m.id)
    if (pollMessageIds.length > 0) {
      const { data: pollsData } = await supabase
        .from('community_chat_polls')
        .select('id, question, allow_multiple, is_closed, message_id, options:community_chat_poll_options(id, text, sort_order)')
        .in('message_id', pollMessageIds)

      if (pollsData && pollsData.length > 0) {
        const pollIds = pollsData.map((p: Record<string, unknown>) => p.id as string)
        const [{ data: allVotes }, { data: myVotes }] = await Promise.all([
          supabase.from('community_chat_poll_votes').select('poll_id, option_id, user_id').in('poll_id', pollIds),
          supabase.from('community_chat_poll_votes').select('poll_id, option_id').eq('user_id', user.id).in('poll_id', pollIds),
        ])
        const voterIds = Array.from(new Set((allVotes ?? []).map((v: Record<string, string>) => v.user_id)))
        let profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {}
        if (voterIds.length > 0) {
          const { data: profilesData } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', voterIds)
          for (const p of (profilesData ?? []) as { id: string; display_name: string; avatar_url: string | null }[]) {
            profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }
          }
        }
        for (const poll of pollsData) {
          const p = poll as Record<string, unknown>
          const pOptions = ((p.options as { id: string; text: string; sort_order: number }[]) ?? [])
            .slice().sort((a, b) => a.sort_order - b.sort_order)
          const myVoteOptionIds = (myVotes ?? []).filter((v: Record<string, string>) => v.poll_id === p.id).map((v: Record<string, string>) => v.option_id)
          const options: PollOption[] = pOptions.map(opt => {
            const optVotes = (allVotes ?? []).filter((v: Record<string, string>) => v.poll_id === p.id && v.option_id === opt.id)
            return {
              id: opt.id,
              text: opt.text,
              sort_order: opt.sort_order,
              vote_count: optVotes.length,
              has_my_vote: myVoteOptionIds.includes(opt.id),
              voters: optVotes.map((v: Record<string, string>) => ({
                user_id: v.user_id,
                display_name: profileMap[v.user_id]?.display_name ?? 'Thành viên',
                avatar_url: profileMap[v.user_id]?.avatar_url ?? null,
              })),
            }
          })
          const totalVotes = (allVotes ?? []).filter((v: Record<string, string>) => v.poll_id === p.id).length
          initialPollsMap[p.message_id as string] = {
            id: p.id as string,
            question: p.question as string,
            allow_multiple: p.allow_multiple as boolean,
            is_closed: p.is_closed as boolean,
            options,
            total_votes: totalVotes,
            my_vote_option_ids: myVoteOptionIds,
          }
        }
      }
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
      initialPollsMap={initialPollsMap}
      myMembershipMap={myMembershipMap}
    />
  )
}
