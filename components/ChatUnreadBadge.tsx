'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const EPOCH = new Date(0).toISOString()

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

  // Initial unread + mention counts. Each is a SINGLE query (not one request
  // per room): the old per-room fan-out fired ~10 parallel `count: exact` HEAD
  // requests on every page load, which saturated the Supabase REST pooler and
  // returned intermittent 503s. After this initial read, the realtime
  // subscriptions below keep the badge live — no polling.
  useEffect(() => {
    if (isOnChatPage) return

    const supabase = createClient()
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    async function load(): Promise<boolean> {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || !mountedRef.current || cancelled) return false

      const uid = session.user.id
      setUserId(uid)

      const [{ data: readStates }, { data: rooms }] = await Promise.all([
        supabase.from('community_chat_read_states').select('room_id, last_read_at').eq('user_id', uid),
        supabase.from('community_chat_rooms').select('id').eq('is_active', true),
      ])
      if (!rooms || !mountedRef.current || cancelled) return false
      setRoomIds(rooms.map((r) => r.id as string))

      // One OR-combined count over every accessible room instead of N per-room
      // counts. Each message belongs to exactly one room, so the total matches
      // the previous sum. Normalise last_read_at to a Z-form ISO string so the
      // value carries no `+` offset inside the PostgREST or() filter.
      const orFilter = rooms
        .map((room) => {
          const rs = readStates?.find((r) => r.room_id === room.id)
          const since = rs?.last_read_at ? new Date(rs.last_read_at).toISOString() : EPOCH
          return `and(room_id.eq.${room.id},created_at.gt.${since})`
        })
        .join(',')

      const msgPromise = rooms.length
        ? supabase
            .from('community_chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('is_deleted', false)
            .neq('user_id', uid)
            .or(orFilter)
        : null

      const [msgRes, mentionRes] = await Promise.all([
        msgPromise,
        supabase
          .from('community_chat_mentions')
          .select('id', { count: 'exact', head: true })
          .eq('mentioned_user_id', uid)
          .eq('is_read', false),
      ])

      if (!mountedRef.current || cancelled) return false
      // On a transient error (e.g. 503) leave the existing badge untouched
      // rather than zeroing it — realtime keeps it live and we retry once.
      if (!msgRes?.error) setCount(msgRes?.count ?? 0)
      if (!mentionRes.error) setMentionCount(mentionRes.count ?? 0)
      return Boolean(msgRes?.error || mentionRes.error)
    }

    load()
      .then((hadError) => {
        if (hadError && mountedRef.current && !cancelled) {
          // Single delayed retry so a transient pooler 503 doesn't leave a
          // stale badge, without hammering the endpoint.
          retryTimer = setTimeout(() => { void load() }, 4000)
        }
      })
      .catch(() => { /* network hiccup — realtime + next load recover */ })

    return () => { cancelled = true; clearTimeout(retryTimer) }
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
