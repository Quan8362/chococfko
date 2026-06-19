'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ChatUnreadBadge() {
  const [count, setCount] = useState(0)
  const [mentionCount, setMentionCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  // Only the rooms the viewer may access (RLS-filtered). Internal rooms never
  // appear here for a community user, so they are never subscribed to and their
  // activity never reaches this badge.
  const [roomIds, setRoomIds] = useState<string[]>([])
  const pathname = usePathname()
  const mountedRef = useRef(true)
  // Unique per instance to avoid Supabase channel name collision between desktop nav and mobile menu
  const instanceId = useRef(`badge-${Math.random().toString(36).slice(2)}`)

  const isOnChatPage = pathname?.startsWith('/community/chat') ?? false

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  // Reset counts khi user đang xem trang chat
  useEffect(() => {
    if (isOnChatPage) {
      setCount(0)
      setMentionCount(0)
    }
  }, [isOnChatPage])

  // Lấy user + tính unread count + mention count ban đầu
  useEffect(() => {
    if (isOnChatPage) return

    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user || !mountedRef.current) return

      const uid = session.user.id
      setUserId(uid)

      const [{ data: readStates }, { data: rooms }] = await Promise.all([
        supabase
          .from('community_chat_read_states')
          .select('room_id, last_read_at')
          .eq('user_id', uid),
        supabase
          .from('community_chat_rooms')
          .select('id')
          .eq('is_active', true),
      ])

      if (!rooms || !mountedRef.current) return

      setRoomIds(rooms.map((r) => r.id as string))

      // Unread messages per room (parallel)
      const msgCounts = await Promise.all(
        rooms.map(async (room) => {
          const rs = readStates?.find((r) => r.room_id === room.id)
          const since = rs?.last_read_at ?? new Date(0).toISOString()
          const { count: cnt } = await supabase
            .from('community_chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', room.id)
            .eq('is_deleted', false)
            .neq('user_id', uid)
            .gt('created_at', since)
          return cnt ?? 0
        })
      )

      // Unread mentions
      const { count: mCnt } = await supabase
        .from('community_chat_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('mentioned_user_id', uid)
        .eq('is_read', false)

      if (mountedRef.current) {
        setCount(msgCounts.reduce((a, b) => a + b, 0))
        setMentionCount(mCnt ?? 0)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnChatPage])

  // Realtime: unread messages — one room-filtered channel per ACCESSIBLE room.
  // We never open a broad community_chat_messages feed, so a community user
  // cannot receive (or even observe the existence of) internal-room messages.
  const roomKey = roomIds.join(',')
  useEffect(() => {
    if (!userId || isOnChatPage || roomIds.length === 0) return

    const supabase = createClient()
    let mounted = true

    const channels = roomIds.map((rid) =>
      supabase
        .channel(`chat-unread-${instanceId.current}-${rid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_chat_messages', filter: `room_id=eq.${rid}` },
          (payload) => {
            if (!mounted) return
            const msg = payload.new as { user_id: string | null; is_deleted: boolean }
            if (msg.is_deleted || msg.user_id === userId) return
            setCount((n) => n + 1)
          }
        )
        .subscribe()
    )

    return () => {
      mounted = false
      channels.forEach((c) => supabase.removeChannel(c))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isOnChatPage, roomKey])

  // Realtime: unread mentions (only for current user)
  useEffect(() => {
    if (!userId || isOnChatPage) return

    const supabase = createClient()
    let mounted = true

    const channel = supabase
      .channel(`chat-mentions-badge-${instanceId.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_mentions',
          filter: `mentioned_user_id=eq.${userId}`,
        },
        (payload) => {
          if (!mounted) return
          // Only count if the mention is for someone else (already guaranteed by filter, but double-check)
          const m = payload.new as { mentioned_by: string }
          if (m.mentioned_by === userId) return
          setMentionCount((n) => n + 1)
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [userId, isOnChatPage])

  if ((count <= 0 && mentionCount <= 0) || isOnChatPage) return null

  return (
    <>
      {count > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 text-[9px] font-bold rounded-full bg-rose text-white leading-none px-1">
          {count > 99 ? '99+' : count}
        </span>
      )}
      {mentionCount > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 text-[9px] font-bold rounded-full bg-amber-500 text-white leading-none px-1">
          @{mentionCount > 9 ? '9+' : mentionCount}
        </span>
      )}
    </>
  )
}
