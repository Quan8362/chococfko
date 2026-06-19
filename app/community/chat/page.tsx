import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { isInternalMember } from '@/lib/access-server'
import { validateRequestedScope, type Scope } from '@/lib/access'
import { getUserIdentity } from '@/lib/userIdentity'
import { getOrCreateDmConversation, getDmMessages, type DmMessage, type DmReactionsMap } from './dm-actions'
import ChatClient from './ChatClient'

export async function generateMetadata() {
  const t = await getTranslations('meta')
  // Chat is auth-gated, user-specific, and (for internal members) contains
  // internal content — never index it.
  return {
    title: `${t('community_chat')} · Chợ Cóc FKO`,
    robots: { index: false, follow: false },
  }
}
export const dynamic = 'force-dynamic'

export type Room = {
  id: string
  key: string | null
  name: string
  sort_order: number
  is_private: boolean
  created_by: string | null
  avatar_url: string | null
  community_scope: Scope
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

export type ReactionItem = { emoji: string; count: number; hasMyReaction: boolean; users: string[] }
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
  profileMap: Record<string, string> = {},
): ReactionsMap {
  const map: ReactionsMap = {}
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = []
    const existing = map[row.message_id].find(r => r.emoji === row.emoji)
    const name = profileMap[row.user_id] ?? null
    if (existing) {
      existing.count++
      if (row.user_id === userId) existing.hasMyReaction = true
      if (name && !existing.users.includes(name)) existing.users.push(name)
    } else {
      map[row.message_id].push({ emoji: row.emoji, count: 1, hasMyReaction: row.user_id === userId, users: name ? [name] : [] })
    }
  }
  return map
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CongDongChatPage({
  searchParams,
}: {
  searchParams: { room?: string; msg?: string; dm?: string; scope?: string }
}) {
  const supabase = createClient()
  const t = await getTranslations('community_chat')
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Effective access (auth + internal + admin). Memberships + profile don't
  // depend on the resolved scope, so fetch them in the same wave.
  const [isAdmin, isInternal, profileResult, membershipsResult] = await Promise.all([
    checkIsAdmin(),
    isInternalMember(user.id),
    supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
    supabase.from('community_chat_room_members').select('room_id, role').eq('user_id', user.id),
  ])

  // A community user who forges ?scope=fko_internal is silently downgraded to
  // community (never leaks internal data). RLS independently enforces the same.
  const access = { userId: user.id, isInternal, isAdmin }
  const scope: Scope = validateRequestedScope(searchParams.scope, access)

  const roomsResult = await supabase
    .from('community_chat_rooms')
    .select('id, key, name, sort_order, is_private, created_by, avatar_url, community_scope')
    .eq('is_active', true)
    .eq('community_scope', scope)
    .order('sort_order', { ascending: true })

  const rooms = (roomsResult.data ?? []) as Room[]
  const membershipsData = membershipsResult.data

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
      const reactionRows = (reactionsData ?? []) as { message_id: string; user_id: string; emoji: string }[]
      const reactorIds = Array.from(new Set(reactionRows.map(r => r.user_id)))
      let reactionProfileMap: Record<string, string> = {}
      if (reactorIds.length > 0) {
        const { data: rProfiles } = await supabase.from('profiles').select('id, display_name').in('id', reactorIds)
        for (const p of (rProfiles ?? []) as { id: string; display_name: string }[]) {
          reactionProfileMap[p.id] = p.display_name
        }
      }
      initialReactions = buildReactionsMap(reactionRows, user.id, reactionProfileMap)
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
                display_name: profileMap[v.user_id]?.display_name ?? t('member_fallback'),
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
    t('member_fallback')

  // Deep-link from a member's public profile: ?dm=<userId>. Prefetch the
  // conversation + its messages on the server so the DM opens instantly on mount
  // (no client round-trips).
  let initialDm:
    | { conversationId: string; partner: { id: string; name: string; avatar: string | null }; messages: DmMessage[]; reactions: DmReactionsMap }
    | undefined
  const dmTargetId = searchParams.dm
  if (dmTargetId && UUID_RE.test(dmTargetId) && dmTargetId !== user.id) {
    const [identity, conv] = await Promise.all([
      getUserIdentity(dmTargetId),
      getOrCreateDmConversation(dmTargetId),
    ])
    if (conv.conversationId && (identity.name || identity.avatarUrl)) {
      const { messages, reactions } = await getDmMessages(conv.conversationId)
      initialDm = {
        conversationId: conv.conversationId,
        partner: { id: dmTargetId, name: identity.name || t('member_fallback'), avatar: identity.avatarUrl },
        messages: messages ?? [],
        reactions: reactions ?? {},
      }
    }
  }

  return (
    <ChatClient
      userId={user.id}
      displayName={displayName}
      avatarUrl={profileResult.data?.avatar_url ?? null}
      isAdmin={isAdmin}
      isInternal={isInternal}
      scope={scope}
      rooms={rooms}
      initialRoomId={initialRoom?.id ?? ''}
      initialRoomKey={initialRoom?.key ?? 'general'}
      initialMessages={initialMessages}
      initialPinnedMessages={initialPinnedMessages}
      initialReactions={initialReactions}
      initialPollsMap={initialPollsMap}
      myMembershipMap={myMembershipMap}
      initialHighlightMsgId={typeof searchParams.msg === 'string' ? searchParams.msg : undefined}
      initialDm={initialDm}
    />
  )
}
