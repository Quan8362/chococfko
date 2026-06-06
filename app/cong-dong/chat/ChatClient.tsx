'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false })
import {
  sendMessage, deleteMessage, reportMessage,
  toggleReaction, pinMessage, unpinMessage, saveImageMessage, saveFileMessage, editMessage,
} from './actions'
import {
  createRoom, getRoomMembers, searchUsersForRoom,
  addMembersToRoom, removeMemberFromRoom, updateMemberRole, deleteRoom, updateRoomAvatar,
} from './room-actions'
import type { Room, ChatMessage, ReactionsMap, ChatAttachment } from './page'

// Keep in sync with MSG_SELECT in page.tsx — value import from page.tsx would break the build
const MSG_SELECT =
  'id, user_id, display_name, avatar_url, message, is_deleted, created_at, room_id, is_pinned, pinned_at, pinned_by, mentioned_user_ids, mentioned_names, reply_to_id, reply_to_message, reply_to_display_name, has_attachment, edited_at, attachments:community_chat_attachments(id, storage_bucket, storage_path, mime_type, file_size, file_name)'
import type { UserSuggestion } from './actions'
import type { RoomMember, UserSearchResult } from './room-actions'

const STORAGE_BUCKET = 'community-chat-images'
const STORAGE_BUCKET_FILES = 'community-chat-files'
const STORAGE_BUCKET_ROOM_AVATARS = 'community-chat-room-avatars'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_FILE_TYPES = [
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
]
const MAX_IMAGE_SIZE = 3 * 1024 * 1024
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_AVATAR_SIZE = 2 * 1024 * 1024

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType === 'application/msword') return '📝'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊'
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📑'
  if (mimeType === 'text/plain') return '📃'
  if (mimeType === 'text/csv') return '📋'
  if (mimeType === 'application/zip') return '🗜️'
  return '📎'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Room avatar helpers ───────────────────────────────────────────────────────

const PUBLIC_ROOM_DEFS: Record<string, { emoji: string; bg: string }> = {
  general: { emoji: '💬', bg: 'bg-rose/10' },
  food:    { emoji: '🍜', bg: 'bg-orange-100' },
  travel:  { emoji: '✈️', bg: 'bg-sky-100' },
  games:   { emoji: '🎮', bg: 'bg-purple-100' },
  help:    { emoji: '🙋', bg: 'bg-emerald-100' },
}

const PRIVATE_ROOM_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
]

function roomColorClass(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PRIVATE_ROOM_COLORS[h % PRIVATE_ROOM_COLORS.length]
}

const AVATAR_SIZE = {
  sm: { container: 'w-6 h-6 rounded-lg', text: 'text-[13px]' },
  md: { container: 'w-8 h-8 rounded-xl', text: 'text-[18px]' },
  lg: { container: 'w-9 h-9 rounded-xl', text: 'text-[15px]' },
  xl: { container: 'w-14 h-14 rounded-xl', text: 'text-[24px]' },
} as const

function RoomAvatarIcon({ room, size }: { room: Room; size: keyof typeof AVATAR_SIZE }) {
  const sz = AVATAR_SIZE[size]
  if (!room.is_private) {
    const def = room.key ? PUBLIC_ROOM_DEFS[room.key] : null
    return (
      <div className={`flex-none ${sz.container} flex items-center justify-center shrink-0 ${def?.bg ?? 'bg-rose/10'}`}>
        <span className={`${sz.text} leading-none`}>{def?.emoji ?? '💬'}</span>
      </div>
    )
  }
  if (room.avatar_url) {
    return (
      <div className={`flex-none ${sz.container} overflow-hidden shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={room.avatar_url} alt={room.name} className="w-full h-full object-cover" />
      </div>
    )
  }
  const colorCls = roomColorClass(room.name)
  return (
    <div className={`flex-none ${sz.container} flex items-center justify-center shrink-0 ${colorCls}`}>
      <span className={`${sz.text} font-bold leading-none`}>{getInitial(room.name)}</span>
    </div>
  )
}

const PAGE_SIZE = 50

function formatTokyo(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(new Date(iso))
}

function getInitial(name: string): string {
  return name ? name[0].toUpperCase() : '?'
}

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

function getAtQuery(text: string, cursorPos: number): { query: string; start: number } | null {
  const before = text.slice(0, cursorPos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  const afterAt = before.slice(atIdx + 1)
  if (/\s/.test(afterAt)) return null
  return { query: afterAt, start: atIdx }
}

function renderMessageContent(
  text: string,
  mentionedNames: string[] | null,
  currentUserDisplayName: string,
): React.ReactNode {
  if (!mentionedNames?.length) return text
  const mentionSet = new Set(mentionedNames)
  const parts = text.split(/(@[^\s]+)/g)
  const nodes: React.ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part.startsWith('@')) { nodes.push(part); continue }
    const rawName = part.slice(1)
    const name = rawName.replace(/[,.:;!?()\[\]{}'"]+$/, '')
    const suffix = rawName.slice(name.length)
    if (!mentionSet.has(name)) { nodes.push(part); continue }
    const isMe = name === currentUserDisplayName
    nodes.push(
      <span
        key={i}
        className={`rounded-sm px-0.5 font-semibold ${
          isMe ? 'bg-rose/20 text-rose' : 'bg-sky-100 text-sky-700'
        }`}
      >
        {'@' + name}
      </span>
    )
    if (suffix) nodes.push(suffix)
  }
  return <>{nodes}</>
}

type PendingMention = { userId: string; displayName: string }
type ReplyState = { id: string; message: string; display_name: string }
type PresencePayload = {
  user_id: string
  display_name: string
  avatar_url: string | null
  room_id: string
  online_at: string
  is_typing?: boolean
}

export default function ChatClient({
  userId,
  displayName,
  avatarUrl,
  isAdmin,
  rooms,
  initialRoomId,
  initialRoomKey: _initialRoomKey,
  initialMessages,
  initialPinnedMessages,
  initialReactions,
  myMembershipMap,
}: {
  userId: string
  displayName: string
  avatarUrl: string | null
  isAdmin: boolean
  rooms: Room[]
  initialRoomId: string
  initialRoomKey: string
  initialMessages: ChatMessage[]
  initialPinnedMessages: ChatMessage[]
  initialReactions: ReactionsMap
  myMembershipMap: Record<string, { role: 'owner' | 'admin' | 'member' }>
}) {
  const t = useTranslations('community_chat')
  const locale = useLocale()

  // ── Core chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>(initialPinnedMessages)
  const [reactions, setReactions] = useState<ReactionsMap>(initialReactions)
  // null = closed, 'input' = insert into textarea, string = msgId for reaction
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<null | 'input' | string>(null)
  const [emojiData, setEmojiData] = useState<object | null>(null)
  const [currentRoomId, setCurrentRoomId] = useState(initialRoomId)
  const [loadingRoom, setLoadingRoom] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialMessages.length === PAGE_SIZE)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportFeedback, setReportFeedback] = useState<string | null>(null)

  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionUsers, setMentionUsers] = useState<UserSuggestion[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([])

  // Reply state
  const [replyingTo, setReplyingTo] = useState<ReplyState | null>(null)
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // File attachment
  const [attachFile, setAttachFile] = useState<File | null>(null)

  // ── Phase 8: Rooms state ─────────────────────────────────────────────────────
  const [localRooms, setLocalRooms] = useState<Room[]>(rooms)
  const [localMembershipMap, setLocalMembershipMap] = useState(myMembershipMap)
  const [mobileView, setMobileView] = useState<'rooms' | 'chat'>(initialRoomId ? 'chat' : 'rooms')

  // Create room modal
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [createRoomName, setCreateRoomName] = useState('')
  const [createRoomDesc, setCreateRoomDesc] = useState('')
  const [createRoomLoading, setCreateRoomLoading] = useState(false)
  const [roomModalError, setRoomModalError] = useState<string | null>(null)

  // Manage room modal
  const [showManageRoom, setShowManageRoom] = useState(false)
  const [managingRoomId, setManagingRoomId] = useState<string | null>(null)
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<UserSearchResult[]>([])
  const [memberSearchLoading, setMemberSearchLoading] = useState(false)
  const [selectedNewMembers, setSelectedNewMembers] = useState<UserSearchResult[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [roomActionLoading, setRoomActionLoading] = useState(false)
  const [roomAvatarUploading, setRoomAvatarUploading] = useState(false)
  const [roomAvatarError, setRoomAvatarError] = useState<string | null>(null)
  const [roomAvatarSuccess, setRoomAvatarSuccess] = useState<string | null>(null)

  // ── Phase 9: Presence ────────────────────────────────────────────────────────
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())

  // ── Phase 10: Typing, Edit, Search ──────────────────────────────────────────
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; display_name: string }[]>([])
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [openMenuMsgId, setOpenMenuMsgId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileAttachInputRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)
  const currentRoomIdRef = useRef(initialRoomId)
  const mountedRef = useRef(true)
  const loadCooldownRef = useRef(false)
  const pendingSignedUrlsRef = useRef<Set<string>>(new Set())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChannelRef = useRef<any>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roomAvatarInputRef = useRef<HTMLInputElement>(null)

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
    trackEvent('visit_chat', { userId })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [])

  // ── Scroll tracking ──────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (atBottomRef.current && newMsgCount > 0) setNewMsgCount(0)
  }, [newMsgCount])

  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Emoji picker clickaway ────────────────────────────────────────────────
  useEffect(() => {
    if (!emojiPickerTarget) return
    const close = () => setEmojiPickerTarget(null)
    const timer = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', close) }
  }, [emojiPickerTarget])

  // ── Signed URLs for private storage attachments (images & files) ─────────
  useEffect(() => {
    const toFetch: { path: string; bucket: string }[] = []
    for (const msg of messages) {
      const att = msg.attachments?.[0]
      if (att && !signedUrls[att.storage_path] && !pendingSignedUrlsRef.current.has(att.storage_path)) {
        const bucket = att.storage_bucket || (att.mime_type.startsWith('image/') ? STORAGE_BUCKET : STORAGE_BUCKET_FILES)
        toFetch.push({ path: att.storage_path, bucket })
        pendingSignedUrlsRef.current.add(att.storage_path)
      }
    }
    if (toFetch.length === 0) return

    const supabase = createClient()
    Promise.all(
      toFetch.map(({ path, bucket }) =>
        supabase.storage.from(bucket).createSignedUrl(path, 86400).then(
          ({ data }) => ({ path, url: data?.signedUrl ?? null })
        )
      )
    ).then(results => {
      if (!mountedRef.current) return
      const updates: Record<string, string> = {}
      for (const { path, url } of results) {
        if (url) updates[path] = url
        else pendingSignedUrlsRef.current.delete(path)
      }
      if (Object.keys(updates).length > 0) setSignedUrls(prev => ({ ...prev, ...updates }))
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ESC to close lightbox ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lightboxUrl) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [lightboxUrl])

  // ── Click-outside + ESC to close message action menu ─────────────────────
  useEffect(() => {
    if (!openMenuMsgId) return
    const closeClick = () => { setOpenMenuMsgId(null); setMenuPos(null) }
    const closeKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenMenuMsgId(null); setMenuPos(null) } }
    const timer = setTimeout(() => {
      document.addEventListener('click', closeClick)
      document.addEventListener('keydown', closeKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', closeClick)
      document.removeEventListener('keydown', closeKey)
    }
  }, [openMenuMsgId])

  // ── Mention autocomplete search ───────────────────────────────────────────
  useEffect(() => {
    if (mentionQuery === null) { setMentionUsers([]); return }
    const timer = setTimeout(async () => {
      if (!mountedRef.current) return
      setMentionLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .ilike('display_name', `%${mentionQuery}%`)
        .not('display_name', 'is', null)
        .limit(8)
      if (!mountedRef.current) return
      setMentionLoading(false)
      setMentionUsers((data ?? []) as UserSuggestion[])
      setMentionIndex(0)
    }, 150)
    return () => clearTimeout(timer)
  }, [mentionQuery])

  // ── Member search (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    if (!showManageRoom || !managingRoomId) return
    if (memberSearch.length < 2) { setMemberSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (!mountedRef.current) return
      setMemberSearchLoading(true)
      const result = await searchUsersForRoom(memberSearch, managingRoomId)
      if (!mountedRef.current) return
      setMemberSearchLoading(false)
      setMemberSearchResults(result.users ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [memberSearch, showManageRoom, managingRoomId])

  // ── Message search (debounced ilike) ─────────────────────────────────────
  useEffect(() => {
    if (!showSearch || searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (!mountedRef.current) return
      setSearchLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('community_chat_messages')
        .select(MSG_SELECT)
        .eq('room_id', currentRoomIdRef.current)
        .eq('is_deleted', false)
        .ilike('message', `%${searchQuery.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!mountedRef.current) return
      setSearchLoading(false)
      setSearchResults((data ?? []) as ChatMessage[])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showSearch])

  // ── Presence: track who is online + typing in current room ──────────────
  useEffect(() => {
    if (!currentRoomId) return

    // For private rooms: only subscribe if user is a member
    const room = localRooms.find(r => r.id === currentRoomId)
    if (room?.is_private && !localMembershipMap[currentRoomId]) return

    const supabase = createClient()
    let mounted = true

    const ch = supabase.channel(`community-chat-presence-${currentRoomId}`)
    presenceChannelRef.current = ch

    const handleSync = () => {
      if (!mounted) return
      const state = ch.presenceState<PresencePayload>()
      const ids = new Set<string>()
      const typing: { user_id: string; display_name: string }[] = []
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          ids.add(p.user_id)
          if (p.is_typing && p.user_id !== userId) {
            if (!typing.some(t => t.user_id === p.user_id)) {
              typing.push({ user_id: p.user_id, display_name: p.display_name })
            }
          }
        }
      }
      setOnlineUserIds(ids)
      setTypingUsers(typing)
    }

    ch.on('presence', { event: 'sync' }, handleSync)
      .on('presence', { event: 'join' }, handleSync)
      .on('presence', { event: 'leave' }, handleSync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && mounted) {
          await ch.track({
            user_id: userId,
            display_name: displayName,
            avatar_url: avatarUrl,
            room_id: currentRoomId,
            online_at: new Date().toISOString(),
            is_typing: false,
          })
        }
      })

    return () => {
      mounted = false
      presenceChannelRef.current = null
      setOnlineUserIds(new Set())
      setTypingUsers([])
      supabase.removeChannel(ch)
    }
  }, [currentRoomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Read state + mark mentions read ──────────────────────────────────────
  const updateReadState = useCallback(async (roomId: string) => {
    const supabase = createClient()
    await Promise.all([
      supabase.from('community_chat_read_states').upsert(
        { user_id: userId, room_id: roomId, last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,room_id' }
      ),
      supabase
        .from('community_chat_mentions')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('mentioned_user_id', userId)
        .eq('room_id', roomId)
        .eq('is_read', false),
    ])
  }, [userId])

  useEffect(() => { if (initialRoomId) updateReadState(initialRoomId) }, [initialRoomId, updateReadState])

  // ── Load messages + pinned + reactions for a room ─────────────────────────
  const loadRoomMessages = useCallback(async (roomId: string) => {
    setLoadingRoom(true)
    const supabase = createClient()
    const [msgResult, pinnedResult] = await Promise.all([
      supabase.from('community_chat_messages').select(MSG_SELECT)
        .eq('room_id', roomId).eq('is_deleted', false)
        .order('created_at', { ascending: false }).limit(PAGE_SIZE),
      supabase.from('community_chat_messages').select(MSG_SELECT)
        .eq('room_id', roomId).eq('is_pinned', true).eq('is_deleted', false)
        .order('pinned_at', { ascending: true }),
    ])
    if (!mountedRef.current) return
    const msgs = ((msgResult.data ?? []) as ChatMessage[]).reverse()
    const pinned = (pinnedResult.data ?? []) as ChatMessage[]
    const messageIds = msgs.map(m => m.id)
    let newReactions: ReactionsMap = {}
    if (messageIds.length > 0) {
      const { data: reactionsData } = await supabase
        .from('community_chat_reactions').select('message_id, user_id, emoji')
        .in('message_id', messageIds)
      newReactions = buildReactionsMap(
        (reactionsData ?? []) as { message_id: string; user_id: string; emoji: string }[],
        userId,
      )
    }
    if (!mountedRef.current) return
    setMessages(msgs)
    setPinnedMessages(pinned)
    setReactions(newReactions)
    setHasMore(msgs.length === PAGE_SIZE)
    setNewMsgCount(0)
    setLoadingRoom(false)
    setTimeout(() => bottomRef.current?.scrollIntoView(), 80)
  }, [userId])

  const trackTyping = useCallback(async (isTyping: boolean) => {
    const ch = presenceChannelRef.current
    if (!ch || !currentRoomIdRef.current) return
    try {
      await ch.track({
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl,
        room_id: currentRoomIdRef.current,
        online_at: new Date().toISOString(),
        is_typing: isTyping,
      })
    } catch { /* ignore presence errors */ }
  }, [userId, displayName, avatarUrl])

  // ── Switch room ───────────────────────────────────────────────────────────
  const switchRoom = useCallback(async (room: Room) => {
    if (room.id === currentRoomIdRef.current) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    currentRoomIdRef.current = room.id
    setCurrentRoomId(room.id)
    setMessages([])
    setPinnedMessages([])
    setReactions({})
    setEmojiPickerTarget(null)
    setMentionQuery(null)
    setReplyingTo(null)
    setError(null)
    setEmojiPickerTarget(null)
    setEditingMsgId(null)
    setOpenMenuMsgId(null)
    setMenuPos(null)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    window.history.replaceState(null, '', `/cong-dong/chat?room=${room.key ?? room.id}`)
    trackEvent('switch_chat_room', { userId })
    await loadRoomMessages(room.id)
    await updateReadState(room.id)
  }, [loadRoomMessages, updateReadState, userId])

  // ── Load older messages ──────────────────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0 || loadCooldownRef.current) return
    const oldest = messages[0]
    setLoadingMore(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('community_chat_messages').select(MSG_SELECT)
      .eq('room_id', currentRoomIdRef.current).eq('is_deleted', false)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE)
    if (!mountedRef.current) return
    setLoadingMore(false)
    if (!data || data.length === 0) { setHasMore(false); return }
    const older = (data as ChatMessage[]).reverse()
    const scrollEl = scrollRef.current
    const heightBefore = scrollEl?.scrollHeight ?? 0
    const olderIds = older.map(m => m.id)
    const { data: reactionsData } = await supabase
      .from('community_chat_reactions').select('message_id, user_id, emoji')
      .in('message_id', olderIds)
    const olderReactions = buildReactionsMap(
      (reactionsData ?? []) as { message_id: string; user_id: string; emoji: string }[],
      userId,
    )
    setMessages(prev => [...older, ...prev])
    setReactions(prev => ({ ...olderReactions, ...prev }))
    setHasMore(data.length === PAGE_SIZE)
    requestAnimationFrame(() => {
      if (scrollEl) scrollEl.scrollTop += scrollEl.scrollHeight - heightBefore
    })
    loadCooldownRef.current = true
    setTimeout(() => { loadCooldownRef.current = false }, 1500)
  }, [loadingMore, hasMore, messages, userId])

  const loadOlderRef = useRef(loadOlderMessages)
  useEffect(() => { loadOlderRef.current = loadOlderMessages }, [loadOlderMessages])

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const scrollEl = scrollRef.current
    if (!sentinel || !scrollEl) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadOlderRef.current() },
      { threshold: 0.5, root: scrollEl }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [currentRoomId])

  // ── Realtime: messages ─────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    const channel = supabase
      .channel(`community-chat-room-${currentRoomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'community_chat_messages',
        filter: `room_id=eq.${currentRoomId}`,
      }, async (payload) => {
        if (!mounted) return
        let msg = payload.new as ChatMessage
        if (msg.is_deleted) return
        if (msg.has_attachment) {
          await new Promise(r => setTimeout(r, 400))
          if (!mounted) return
          const { data: att } = await supabase
            .from('community_chat_attachments')
            .select('id, storage_path, mime_type, file_size, file_name')
            .eq('message_id', msg.id).maybeSingle()
          if (att) msg = { ...msg, attachments: [att as ChatAttachment] }
        }
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        if (!atBottomRef.current) setNewMsgCount(n => n + 1)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'community_chat_messages',
        filter: `room_id=eq.${currentRoomId}`,
      }, (payload) => {
        if (!mounted) return
        const updated = payload.new as ChatMessage
        if (updated.is_deleted) {
          setMessages(prev => prev.filter(m => m.id !== updated.id))
          setPinnedMessages(prev => prev.filter(m => m.id !== updated.id))
        } else {
          setMessages(prev => prev.map(m => {
            if (m.id !== updated.id) return m
            return { ...updated, attachments: m.attachments }
          }))
          if (updated.is_pinned) {
            setPinnedMessages(prev => {
              if (prev.some(m => m.id === updated.id)) return prev.map(m => m.id === updated.id ? updated : m)
              return [...prev, updated]
            })
          } else {
            setPinnedMessages(prev => prev.filter(m => m.id !== updated.id))
          }
        }
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [currentRoomId])

  // ── Realtime: reactions ────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    const channel = supabase
      .channel('community-chat-reactions-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_chat_reactions' },
        (payload) => {
          if (!mounted) return
          const r = payload.new as { message_id: string; user_id: string; emoji: string }
          if (r.user_id === userId) return
          setReactions(prev => {
            const msgR = [...(prev[r.message_id] ?? [])]
            const idx = msgR.findIndex(x => x.emoji === r.emoji)
            if (idx >= 0) msgR[idx] = { ...msgR[idx], count: msgR[idx].count + 1 }
            else msgR.push({ emoji: r.emoji, count: 1, hasMyReaction: false })
            return { ...prev, [r.message_id]: msgR }
          })
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_chat_reactions' },
        (payload) => {
          if (!mounted) return
          const r = payload.old as { message_id: string; user_id: string; emoji: string }
          if (r.user_id === userId) return
          setReactions(prev => {
            const msgR = [...(prev[r.message_id] ?? [])]
            const idx = msgR.findIndex(x => x.emoji === r.emoji)
            if (idx >= 0) {
              const newCount = msgR[idx].count - 1
              if (newCount <= 0) msgR.splice(idx, 1)
              else msgR[idx] = { ...msgR[idx], count: newCount }
            }
            return { ...prev, [r.message_id]: msgR }
          })
        })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [userId])

  // ── Mention select ────────────────────────────────────────────────────────
  const selectMention = useCallback((user: UserSuggestion) => {
    const pos = inputRef.current?.selectionStart ?? input.length
    const atResult = getAtQuery(input, pos)
    if (!atResult) return
    const replacement = '@' + user.display_name
    const newText = input.slice(0, atResult.start) + replacement + ' ' + input.slice(pos)
    setInput(newText)
    setPendingMentions(prev =>
      prev.some(m => m.userId === user.id) ? prev : [...prev, { userId: user.id, displayName: user.display_name }]
    )
    setMentionQuery(null)
    setMentionUsers([])
    setMentionIndex(0)
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = atResult.start + replacement.length + 1
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }, [input])

  // ── Input change ─────────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    const pos = e.target.selectionStart ?? val.length
    const atResult = getAtQuery(val, pos)
    if (atResult) setMentionQuery(atResult.query)
    else setMentionQuery(null)

    if (val.trim()) {
      trackTyping(true)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => trackTyping(false), 2500)
    }
  }

  // ── Image select / remove ─────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError(t('error_invalid_file_type'))
      setTimeout(() => setError(null), 4000)
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(t('error_file_too_large'))
      setTimeout(() => setError(null), 4000)
      return
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  const handleRemoveImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
  }

  // ── File attachment select / remove / send ────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError(t('error_invalid_file_type_detail'))
      setTimeout(() => setError(null), 5000)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('error_file_too_large'))
      setTimeout(() => setError(null), 4000)
      return
    }
    setAttachFile(file)
    setError(null)
  }

  const handleRemoveFile = () => {
    setAttachFile(null)
  }

  const handleSendFile = async () => {
    if (!attachFile || uploading || !currentRoomIdRef.current) return
    const caption = input.trim()
    if (caption.length > 500) { setError(t('error_too_long')); return }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    trackTyping(false)
    const validMentions = pendingMentions.filter(m => caption.includes('@' + m.displayName))
    const mentionedUserIds = validMentions.length > 0 ? validMentions.map(m => m.userId) : undefined
    const roomId = currentRoomIdRef.current
    const replySnapshot = replyingTo
    const capturedFile = attachFile

    const tempId = `temp_${Date.now()}`
    const tempPath = `temp_path_${tempId}`
    const tempMsg: ChatMessage = {
      id: tempId,
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      message: caption || '[file]',
      is_deleted: false,
      created_at: new Date().toISOString(),
      room_id: roomId,
      is_pinned: false,
      pinned_at: null,
      pinned_by: null,
      mentioned_user_ids: validMentions.length > 0 ? validMentions.map(m => m.userId) : null,
      mentioned_names: validMentions.length > 0 ? validMentions.map(m => m.displayName) : null,
      reply_to_id: replySnapshot?.id ?? null,
      reply_to_message: replySnapshot?.message ?? null,
      reply_to_display_name: replySnapshot?.display_name ?? null,
      has_attachment: true,
      edited_at: null,
      attachments: [{ id: tempPath, storage_bucket: STORAGE_BUCKET_FILES, storage_path: tempPath, mime_type: capturedFile.type, file_size: capturedFile.size, file_name: capturedFile.name }],
    }
    setMessages(prev => [...prev, tempMsg])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)

    setInput(''); setPendingMentions([]); setReplyingTo(null); setError(null); setMentionQuery(null)
    setAttachFile(null); inputRef.current?.focus()

    setSending(true); setUploading(true)
    const supabase = createClient()
    const ext = capturedFile.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin'
    const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET_FILES).upload(storagePath, capturedFile, { contentType: capturedFile.type })
    if (uploadError) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setError(t('error_file_upload')); setSending(false); setUploading(false); return
    }

    setMessages(prev => prev.map(m =>
      m.id === tempId
        ? { ...m, attachments: [{ id: tempPath, storage_bucket: STORAGE_BUCKET_FILES, storage_path: storagePath, mime_type: capturedFile.type, file_size: capturedFile.size, file_name: capturedFile.name }] }
        : m
    ))

    const result = await saveFileMessage(
      storagePath, capturedFile.name, capturedFile.type, capturedFile.size,
      roomId, caption || undefined, mentionedUserIds, replySnapshot?.id,
    )
    if (result.error) {
      await supabase.storage.from(STORAGE_BUCKET_FILES).remove([storagePath])
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setError(result.error === 'rate_limit' ? t('error_rate_limit') : t('error_send_file'))
    } else if (result.msgId) {
      setMessages(prev => {
        const realExists = prev.some(m => m.id === result.msgId)
        if (realExists) return prev.filter(m => m.id !== tempId)
        return prev.map(m => m.id === tempId ? { ...m, id: result.msgId! } : m)
      })
    }
    setSending(false); setUploading(false)
  }

  // ── Send image message ────────────────────────────────────────────────────
  const handleSendImage = async () => {
    if (!imageFile || uploading || !currentRoomIdRef.current) return
    const caption = input.trim()
    if (caption.length > 500) { setError(t('error_too_long')); return }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    trackTyping(false)
    const validMentions = pendingMentions.filter(m => caption.includes('@' + m.displayName))
    const mentionedUserIds = validMentions.length > 0 ? validMentions.map(m => m.userId) : undefined
    const roomId = currentRoomIdRef.current
    const replySnapshot = replyingTo
    const capturedFile = imageFile

    // Show image immediately using local object URL before upload completes
    const objectUrl = URL.createObjectURL(capturedFile)
    const tempId = `temp_${Date.now()}`
    const tempPath = `temp_path_${tempId}`
    const tempMsg: ChatMessage = {
      id: tempId,
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      message: caption || '[image]',
      is_deleted: false,
      created_at: new Date().toISOString(),
      room_id: roomId,
      is_pinned: false,
      pinned_at: null,
      pinned_by: null,
      mentioned_user_ids: validMentions.length > 0 ? validMentions.map(m => m.userId) : null,
      mentioned_names: validMentions.length > 0 ? validMentions.map(m => m.displayName) : null,
      reply_to_id: replySnapshot?.id ?? null,
      reply_to_message: replySnapshot?.message ?? null,
      reply_to_display_name: replySnapshot?.display_name ?? null,
      has_attachment: true,
      edited_at: null,
      attachments: [{ id: tempPath, storage_bucket: STORAGE_BUCKET, storage_path: tempPath, mime_type: capturedFile.type, file_size: capturedFile.size, file_name: capturedFile.name }],
    }
    setMessages(prev => [...prev, tempMsg])
    setSignedUrls(prev => ({ ...prev, [tempPath]: objectUrl }))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)

    // Clear UI immediately
    setInput(''); setPendingMentions([]); setReplyingTo(null); setError(null); setMentionQuery(null)
    handleRemoveImage(); inputRef.current?.focus()

    setSending(true); setUploading(true)
    const supabase = createClient()
    const ext = capturedFile.type === 'image/png' ? 'png' : capturedFile.type === 'image/webp' ? 'webp' : 'jpg'
    const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET).upload(storagePath, capturedFile, { contentType: capturedFile.type })
    if (uploadError) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setSignedUrls(prev => { const n = { ...prev }; delete n[tempPath]; return n })
      URL.revokeObjectURL(objectUrl)
      setError(t('error_upload')); setSending(false); setUploading(false); return
    }

    // Transfer object URL to the real storage path so image keeps showing during saveImageMessage call
    setMessages(prev => prev.map(m =>
      m.id === tempId
        ? { ...m, attachments: [{ id: tempPath, storage_bucket: STORAGE_BUCKET, storage_path: storagePath, mime_type: capturedFile.type, file_size: capturedFile.size, file_name: capturedFile.name }] }
        : m
    ))
    setSignedUrls(prev => { const n = { ...prev, [storagePath]: objectUrl }; delete n[tempPath]; return n })

    const result = await saveImageMessage(
      storagePath, capturedFile.name, capturedFile.type, capturedFile.size,
      roomId, caption || undefined, mentionedUserIds, replySnapshot?.id,
    )
    if (result.error) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setSignedUrls(prev => { const n = { ...prev }; delete n[storagePath]; return n })
      URL.revokeObjectURL(objectUrl)
      setError(result.error === 'rate_limit' ? t('error_rate_limit') : t('error_send_image'))
    } else if (result.msgId) {
      // Replace temp ID with real ID; if realtime already delivered it, remove temp instead
      setMessages(prev => {
        const realExists = prev.some(m => m.id === result.msgId)
        if (realExists) return prev.filter(m => m.id !== tempId)
        return prev.map(m => m.id === tempId ? { ...m, id: result.msgId! } : m)
      })
    }
    setSending(false); setUploading(false)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (imageFile) { await handleSendImage(); return }
    if (attachFile) { await handleSendFile(); return }
    const msg = input.trim()
    if (!msg || sending || !currentRoomIdRef.current) return
    if (msg.length > 500) { setError(t('error_too_long')); return }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    trackTyping(false)
    const validMentions = pendingMentions.filter(m => msg.includes('@' + m.displayName))
    const mentionedUserIds = validMentions.length > 0 ? validMentions.map(m => m.userId) : undefined
    const roomId = currentRoomIdRef.current
    const replySnapshot = replyingTo

    // Show message immediately before server round-trip
    const tempId = `temp_${Date.now()}`
    const tempMsg: ChatMessage = {
      id: tempId,
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      message: msg,
      is_deleted: false,
      created_at: new Date().toISOString(),
      room_id: roomId,
      is_pinned: false,
      pinned_at: null,
      pinned_by: null,
      mentioned_user_ids: validMentions.length > 0 ? validMentions.map(m => m.userId) : null,
      mentioned_names: validMentions.length > 0 ? validMentions.map(m => m.displayName) : null,
      reply_to_id: replySnapshot?.id ?? null,
      reply_to_message: replySnapshot?.message ?? null,
      reply_to_display_name: replySnapshot?.display_name ?? null,
      has_attachment: false,
      edited_at: null,
      attachments: [],
    }
    setMessages(prev => [...prev, tempMsg])
    setInput(''); setPendingMentions([]); setReplyingTo(null); setError(null); setMentionQuery(null)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    inputRef.current?.focus()

    setSending(true)
    const result = await sendMessage(msg, roomId, mentionedUserIds, replySnapshot?.id)
    setSending(false)
    if (!result.error) {
      trackEvent('send_chat_message', { userId })
      if (result.msgId && result.createdAt) {
        // Replace temp message with confirmed ID; if realtime already delivered it, just remove the temp
        setMessages(prev => {
          const realExists = prev.some(m => m.id === result.msgId)
          if (realExists) return prev.filter(m => m.id !== tempId)
          return prev.map(m => m.id === tempId ? { ...m, id: result.msgId!, created_at: result.createdAt! } : m)
        })
      }
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      if (result.error === 'rate_limit') setError(t('error_rate_limit'))
      else if (result.error === 'empty') setError(t('error_empty'))
      else if (result.error === 'too_long') setError(t('error_too_long'))
      else setError(t('error_send'))
    }
  }

  // ── Admin delete / report / pin ───────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm(t('confirm_delete'))) return
    const result = await deleteMessage(id)
    if (!result.error) setMessages(prev => prev.filter(m => m.id !== id))
  }

  const handleReport = async (id: string) => {
    if (!window.confirm(t('confirm_report'))) return
    const result = await reportMessage(id)
    if (result.error === 'already_reported') setReportFeedback(t('already_reported'))
    else if (result.ok) setReportFeedback(t('report_success'))
    else setReportFeedback(t('error_report'))
    setTimeout(() => setReportFeedback(null), 3000)
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setEmojiPickerTarget(null)
    const snapshot = reactions
    setReactions(prev => {
      const msgR = [...(prev[messageId] ?? [])]
      const idx = msgR.findIndex(r => r.emoji === emoji)
      if (idx >= 0) {
        const r = msgR[idx]
        if (r.hasMyReaction) {
          const newCount = r.count - 1
          if (newCount <= 0) msgR.splice(idx, 1)
          else msgR[idx] = { ...r, count: newCount, hasMyReaction: false }
        } else {
          msgR[idx] = { ...r, count: r.count + 1, hasMyReaction: true }
        }
      } else {
        msgR.push({ emoji, count: 1, hasMyReaction: true })
      }
      return { ...prev, [messageId]: msgR }
    })
    const result = await toggleReaction(messageId, emoji)
    if (result.error) setReactions(snapshot)
  }

  const handlePin = async (messageId: string) => {
    const result = await pinMessage(messageId)
    if (result.error === 'max_pins') {
      setError(t('max_pins_reached')); setTimeout(() => setError(null), 4000)
    } else if (result.error) {
      setError(t('error_pin')); setTimeout(() => setError(null), 3000)
    }
  }

  const handleUnpin = async (messageId: string) => {
    const result = await unpinMessage(messageId)
    if (result.error) { setError(t('error_unpin')); setTimeout(() => setError(null), 3000) }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionUsers.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') { e.preventDefault(); selectMention(mentionUsers[mentionIndex]); return }
    }
    if (e.key === 'Escape' && mentionQuery !== null) { setMentionQuery(null); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewMsgCount(0); atBottomRef.current = true
  }

  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`)
    if (!el) {
      setError(t('reply_original_not_loaded')); setTimeout(() => setError(null), 3000); return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMsgId(msgId)
    setTimeout(() => setHighlightedMsgId(null), 1500)
  }, [t])

  // ── Phase 8: Room handlers ────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    const name = createRoomName.trim()
    if (!name) { setRoomModalError(t('error_room_name_empty')); return }
    if (name.length > 50) { setRoomModalError(t('error_room_name_too_long')); return }
    setCreateRoomLoading(true); setRoomModalError(null)
    const result = await createRoom(name, createRoomDesc)
    setCreateRoomLoading(false)
    if (result.error) {
      if (result.error === 'empty_name') setRoomModalError(t('error_room_name_empty'))
      else if (result.error === 'name_too_long') setRoomModalError(t('error_room_name_too_long'))
      else setRoomModalError(t('error_create_room'))
      return
    }
    const newRoom: Room = {
      id: result.roomId!,
      key: null,
      name,
      sort_order: 999,
      is_private: true,
      created_by: userId,
      avatar_url: null,
    }
    setLocalRooms(prev => [...prev, newRoom])
    setLocalMembershipMap(prev => ({ ...prev, [result.roomId!]: { role: 'owner' } }))
    setShowCreateRoom(false); setCreateRoomName(''); setCreateRoomDesc(''); setRoomModalError(null)
    await switchRoom(newRoom)
    setMobileView('chat')
  }

  const handleOpenManageRoom = async (roomId: string) => {
    setManagingRoomId(roomId)
    setShowManageRoom(true)
    setMembersLoading(true)
    setRoomMembers([])
    setMemberSearch('')
    setMemberSearchResults([])
    setSelectedNewMembers([])
    setRoomAvatarError(null)
    setRoomAvatarSuccess(null)
    const result = await getRoomMembers(roomId)
    setMembersLoading(false)
    if (result.members) setRoomMembers(result.members)
  }

  const handleAddMembers = async () => {
    if (!managingRoomId || selectedNewMembers.length === 0) return
    setAddingMembers(true)
    const result = await addMembersToRoom(managingRoomId, selectedNewMembers.map(m => m.id))
    setAddingMembers(false)
    if (result.error) {
      setRoomModalError(t('error_add_members')); return
    }
    // Refresh member list
    const refreshed = await getRoomMembers(managingRoomId)
    if (refreshed.members) setRoomMembers(refreshed.members)
    setSelectedNewMembers([])
    setMemberSearch('')
    setMemberSearchResults([])
  }

  const handleRemoveMember = async (targetUserId: string) => {
    if (!managingRoomId) return
    setRemovingMemberId(targetUserId)
    const result = await removeMemberFromRoom(managingRoomId, targetUserId)
    setRemovingMemberId(null)
    if (result.error) { setRoomModalError(t('error_remove_member')); return }
    setRoomMembers(prev => prev.filter(m => m.user_id !== targetUserId))
  }

  const handleUpdateRole = async (targetUserId: string, newRole: 'admin' | 'member') => {
    if (!managingRoomId) return
    const result = await updateMemberRole(managingRoomId, targetUserId, newRole)
    if (result.error) { setRoomModalError(t('error_update_role')); return }
    setRoomMembers(prev => prev.map(m =>
      m.user_id === targetUserId ? { ...m, role: newRole } : m
    ))
  }

  const handleLeaveRoom = async () => {
    if (!managingRoomId) return
    if (!window.confirm(t('confirm_leave_room'))) return
    setRoomActionLoading(true)
    const result = await removeMemberFromRoom(managingRoomId, userId)
    setRoomActionLoading(false)
    if (result.error) {
      const msg = result.error === 'owner_cannot_leave' ? t('error_owner_cannot_leave') : t('error_leave_room')
      setRoomModalError(msg); return
    }
    const leavingId = managingRoomId
    setShowManageRoom(false)
    setManagingRoomId(null)
    setLocalRooms(prev => prev.filter(r => r.id !== leavingId))
    setLocalMembershipMap(prev => { const n = { ...prev }; delete n[leavingId]; return n })
    const nextRoom = localRooms.find(r => r.id !== leavingId)
    if (nextRoom) { await switchRoom(nextRoom); setMobileView('chat') }
    else { setCurrentRoomId(''); currentRoomIdRef.current = ''; setMessages([]); setMobileView('rooms') }
  }

  const handleDeleteRoom = async () => {
    if (!managingRoomId) return
    if (!window.confirm(t('confirm_delete_room'))) return
    setRoomActionLoading(true)
    const result = await deleteRoom(managingRoomId)
    setRoomActionLoading(false)
    if (result.error) { setRoomModalError(t('error_delete_room')); return }
    const deletingId = managingRoomId
    setShowManageRoom(false)
    setManagingRoomId(null)
    setLocalRooms(prev => prev.filter(r => r.id !== deletingId))
    setLocalMembershipMap(prev => { const n = { ...prev }; delete n[deletingId]; return n })
    const nextRoom = localRooms.find(r => r.id !== deletingId)
    if (nextRoom) { await switchRoom(nextRoom); setMobileView('chat') }
    else { setCurrentRoomId(''); currentRoomIdRef.current = ''; setMessages([]); setMobileView('rooms') }
  }

  // ── Room avatar upload ────────────────────────────────────────────────────
  const handleRoomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !managingRoomId) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setRoomAvatarError(t('error_avatar_invalid_type'))
      setTimeout(() => setRoomAvatarError(null), 4000)
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setRoomAvatarError(t('error_avatar_too_large'))
      setTimeout(() => setRoomAvatarError(null), 4000)
      return
    }
    setRoomAvatarUploading(true)
    setRoomAvatarError(null)
    setRoomAvatarSuccess(null)
    const supabase = createClient()
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${managingRoomId}/${userId}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET_ROOM_AVATARS)
      .upload(path, file, { contentType: file.type, upsert: true })
    if (uploadError) {
      setRoomAvatarUploading(false)
      setRoomAvatarError(t('error_avatar_upload'))
      setTimeout(() => setRoomAvatarError(null), 4000)
      return
    }
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET_ROOM_AVATARS)
      .getPublicUrl(path)
    const result = await updateRoomAvatar(managingRoomId, publicUrl)
    setRoomAvatarUploading(false)
    if (result.error) {
      setRoomAvatarError(t('error_avatar_upload'))
      setTimeout(() => setRoomAvatarError(null), 4000)
      return
    }
    setLocalRooms(prev => prev.map(r => r.id === managingRoomId ? { ...r, avatar_url: publicUrl } : r))
    setRoomAvatarSuccess(t('avatar_upload_success'))
    setTimeout(() => setRoomAvatarSuccess(null), 3000)
  }

  const handleRemoveRoomAvatar = async () => {
    if (!managingRoomId || roomAvatarUploading) return
    setRoomAvatarUploading(true)
    const result = await updateRoomAvatar(managingRoomId, null)
    setRoomAvatarUploading(false)
    if (result.ok) {
      setLocalRooms(prev => prev.map(r => r.id === managingRoomId ? { ...r, avatar_url: null } : r))
    }
  }

  // ── Emoji picker ─────────────────────────────────────────────────────────
  const openEmojiPicker = useCallback(async (target: 'input' | string) => {
    if (!emojiData) {
      const mod = await import('@emoji-mart/data')
      setEmojiData(mod.default as object)
    }
    setEmojiPickerTarget(prev => prev === target ? null : target)
  }, [emojiData])

  const handleEmojiSelect = useCallback((native: string) => {
    const target = emojiPickerTarget
    setEmojiPickerTarget(null)
    if (!target) return
    if (target === 'input') {
      const ta = inputRef.current
      if (!ta) { setInput(prev => prev + native); return }
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? 0
      setInput(prev => prev.slice(0, start) + native + prev.slice(end))
      setTimeout(() => {
        ta.focus()
        const pos = start + native.length
        ta.setSelectionRange(pos, pos)
      }, 0)
    } else {
      handleReact(target, native)
    }
  }, [emojiPickerTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Copy message ──────────────────────────────────────────────────────────
  const handleCopy = async (text: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMsgId(msgId)
      setTimeout(() => setCopiedMsgId(null), 2000)
    } catch { /* clipboard not available */ }
  }

  // ── Phase 10: Edit message ────────────────────────────────────────────────
  const handleSaveEdit = async (msgId: string) => {
    const newText = editInput.trim()
    if (!newText || editSaving) return
    if (newText.length > 500) { setError(t('error_too_long')); setTimeout(() => setError(null), 4000); return }
    setEditSaving(true)
    const result = await editMessage(msgId, newText)
    setEditSaving(false)
    if (result.error) {
      const msg =
        result.error === 'too_late' ? t('error_edit_too_late') :
        result.error === 'cannot_edit_image' ? t('error_edit_image') :
        t('error_edit_msg')
      setError(msg)
      setTimeout(() => setError(null), 4000)
      return
    }
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, message: newText, edited_at: new Date().toISOString() } : m
    ))
    setEditingMsgId(null)
  }

  // ── Phase 10: Message search ──────────────────────────────────────────────
  // (search useEffect declared below with other useEffects — hoisted here for clarity)

  // ── Derived state ─────────────────────────────────────────────────────────
  const currentRoom = localRooms.find(r => r.id === currentRoomId)
  const currentUserRole = localMembershipMap[currentRoomId]?.role ?? null
  const managingRoom = localRooms.find(r => r.id === managingRoomId)

  const publicRooms = localRooms.filter(r => !r.is_private)
  const privateRooms = localRooms.filter(r => r.is_private)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-muted mb-5">
        <Link href="/cong-dong" className="hover:text-rose transition-colors">
          {t('breadcrumb_community')}
        </Link>
        <span className="text-line">›</span>
        <span className="text-ink font-medium">{t('title')}</span>
      </div>

      {/* Page header */}
      <div className="mb-4">
        <h1 className="font-serif font-semibold text-[clamp(18px,2.2vw,24px)] text-ink leading-tight">
          {t('subtitle')}
        </h1>
      </div>

      {/* Report feedback toast */}
      {reportFeedback && (
        <div className="mb-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[13px] text-emerald-700 flex justify-between items-center">
          <span>{reportFeedback}</span>
          <button onClick={() => setReportFeedback(null)} className="text-emerald-400 hover:text-emerald-600 ml-2 text-[11px]">✕</button>
        </div>
      )}

      {/* Chat container: 2-column layout */}
      <div
        className="border border-line rounded-2xl overflow-hidden bg-paper shadow-md flex"
        style={{ height: 'min(620px, calc(100dvh - 240px))' }}
      >
        {/* ── LEFT: Room sidebar ──────────────────────────────────────────── */}
        <div
          className={`w-56 flex-none border-r border-line flex-col bg-cream/20
            ${mobileView === 'rooms' ? 'flex' : 'hidden'} md:flex`}
        >
          {/* Sidebar header */}
          <div className="flex-none px-4 py-3 border-b border-line bg-cream/40">
            <p className="text-[10px] font-bold text-muted/50 uppercase tracking-widest">
              {t('rooms_header')}
            </p>
          </div>

          {/* Room list */}
          <div className="flex-1 overflow-y-auto min-h-0 py-1">
            {/* Public rooms */}
            {publicRooms.length > 0 && (
              <>
                {privateRooms.length > 0 && (
                  <p className="px-4 pt-3 pb-1.5 text-[9.5px] font-bold text-muted/40 uppercase tracking-widest">
                    {t('public_rooms')}
                  </p>
                )}
                {publicRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => { switchRoom(room); setMobileView('chat') }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-all border-l-[3px] ${
                      room.id === currentRoomId
                        ? 'bg-rose/10 text-rose font-semibold border-rose'
                        : 'text-ink/80 hover:bg-cream hover:text-ink border-transparent'
                    }`}
                  >
                    <RoomAvatarIcon room={room} size="sm" />
                    <span className="flex-1 truncate">{room.name}</span>
                  </button>
                ))}
              </>
            )}

            {/* Private rooms */}
            {privateRooms.length > 0 && (
              <>
                {publicRooms.length > 0 && (
                  <div className="my-1.5 border-t border-line/60" />
                )}
                <p className="px-4 pt-3 pb-1.5 text-[9.5px] font-bold text-muted/40 uppercase tracking-widest">
                  {t('private_rooms')}
                </p>
                {privateRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => { switchRoom(room); setMobileView('chat') }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-all border-l-[3px] ${
                      room.id === currentRoomId
                        ? 'bg-rose/10 text-rose font-semibold border-rose'
                        : 'text-ink/80 hover:bg-cream hover:text-ink border-transparent'
                    }`}
                  >
                    <RoomAvatarIcon room={room} size="sm" />
                    <span className="flex-1 truncate">{room.name}</span>
                  </button>
                ))}
              </>
            )}

            {localRooms.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-muted/40 text-center">{t('empty')}</p>
            )}
          </div>

          {/* Create room button */}
          <button
            onClick={() => setShowCreateRoom(true)}
            className="flex-none flex items-center gap-2.5 px-4 py-3 text-[12.5px] text-muted/60 hover:text-rose hover:bg-rose/8 transition-all border-t border-line font-medium"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
            <span>{t('create_room')}</span>
          </button>
        </div>

        {/* ── RIGHT: Chat area ─────────────────────────────────────────────── */}
        <div
          className={`flex-1 min-w-0 flex-col
            ${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex`}
        >
          {/* Room header */}
          <div className="flex-none border-b border-line px-4 py-2.5 flex items-center gap-3 bg-gradient-to-r from-paper via-paper to-cream/20 min-h-[52px]">
            {/* Mobile: back to room list */}
            <button
              onClick={() => setMobileView('rooms')}
              className="md:hidden flex-none text-muted/60 hover:text-ink transition-colors text-[12px] flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {currentRoom && <RoomAvatarIcon room={currentRoom} size="md" />}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-ink truncate leading-tight">{currentRoom?.name ?? ''}</p>
              {onlineUserIds.size > 0 && (
                <p className="flex items-center gap-1 text-[10.5px] text-emerald-500 leading-none mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  {onlineUserIds.size} {t('people_online')}
                </p>
              )}
            </div>

            {/* Search button */}
            <button
              onClick={() => { setShowSearch(v => !v); setSearchQuery(''); setSearchResults([]) }}
              className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showSearch ? 'text-rose bg-rose/10' : 'text-muted/40 hover:text-ink hover:bg-cream'}`}
              title={t('search_messages')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Manage button (private rooms only, for members) */}
            {currentRoom?.is_private && currentUserRole && (
              <button
                onClick={() => handleOpenManageRoom(currentRoomId)}
                className="flex-none w-8 h-8 rounded-xl text-muted/40 hover:text-ink transition-all hover:bg-cream flex items-center justify-center"
                title={t('manage_room')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Search panel ──────────────────────────────────────────────── */}
          {showSearch && (
            <div className="flex-none border-b border-line">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-cream/40">
                <svg className="w-3.5 h-3.5 text-muted/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('search_placeholder')}
                  autoFocus
                  className="flex-1 text-[16px] sm:text-[12px] bg-transparent focus:outline-none text-ink placeholder:text-muted/40"
                />
                {searchLoading && (
                  <svg className="w-3.5 h-3.5 animate-spin text-muted/40 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <button
                  onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
                  className="text-muted/40 hover:text-ink text-[11px] shrink-0 leading-none"
                >✕</button>
              </div>
              {searchQuery.length >= 2 && !searchLoading && (
                searchResults.length === 0 ? (
                  <div className="px-4 py-2 text-[11px] text-muted/40">{t('search_no_results')}</div>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    {searchResults.map(msg => (
                      <button
                        key={msg.id}
                        onClick={() => scrollToMessage(msg.id)}
                        className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-cream transition-colors border-b border-line/30 last:border-0"
                      >
                        <div className="flex-none w-5 h-5 rounded-full overflow-hidden bg-rose/10 flex items-center justify-center text-[9px] font-bold text-rose shrink-0 mt-0.5">
                          {msg.avatar_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={msg.avatar_url} alt="" className="w-full h-full object-cover" />
                            : getInitial(msg.display_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-ink truncate">{msg.display_name}</span>
                            <span className="text-[9.5px] text-muted/40 shrink-0">{formatTokyo(msg.created_at)}</span>
                          </div>
                          <p className="text-[11px] text-muted/70 truncate">
                            {msg.has_attachment ? `📷 ${msg.message !== '[image]' ? msg.message : t('image_label')}` : msg.message}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* ── Pinned messages panel ──────────────────────────────────────── */}
          {pinnedMessages.length > 0 && (
            <div className="flex-none border-b border-amber-100 bg-amber-50/40 px-3 py-2">
              <p className="text-[10.5px] font-semibold text-amber-600 mb-1 flex items-center gap-1">
                📌 {t('pinned_messages')}
              </p>
              <div className="space-y-1">
                {pinnedMessages.map(msg => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <p className="flex-1 min-w-0 text-[12px] text-ink leading-snug break-words">
                      <span className="font-medium text-muted/70 mr-1">{msg.display_name}:</span>
                      {msg.message.length > 100 ? msg.message.slice(0, 100) + '…' : msg.message}
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => handleUnpin(msg.id)}
                        className="flex-none text-[10px] text-amber-400 hover:text-amber-600 transition-colors shrink-0 mt-0.5 leading-none"
                        title={t('unpin_msg')}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Messages area ──────────────────────────────────────────────── */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 relative bg-gradient-to-b from-cream/15 to-paper/50">
            <div ref={topSentinelRef} className="h-1 w-full" />

            {loadingMore && (
              <div className="text-center py-2">
                <span className="text-[11px] text-muted/50">{t('loading_more')}</span>
              </div>
            )}

            {!hasMore && messages.length > 0 && (
              <div className="text-center py-2">
                <span className="text-[11px] text-muted/30">{t('no_more_messages')}</span>
              </div>
            )}

            {loadingRoom ? (
              <div className="flex items-center justify-center py-16">
                <svg className="w-5 h-5 animate-spin text-rose/50" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-6 select-none py-16">
                <div className="w-16 h-16 rounded-2xl bg-rose/8 flex items-center justify-center">
                  <svg className="w-8 h-8 text-rose/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-[13.5px] font-semibold text-ink/40 text-center">{t('empty')}</p>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {messages.map((msg) => {
                  const isMe = msg.user_id === userId
                  const msgReactions = reactions[msg.id] ?? []
                  const isMentioned = (msg.mentioned_user_ids ?? []).includes(userId)

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`flex gap-2 items-end group transition-colors duration-300 rounded-xl ${
                        highlightedMsgId === msg.id ? 'bg-rose/8' : ''
                      } ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* Avatar */}
                      <div className="relative flex-none w-7 h-7 shrink-0">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-rose/10 flex items-center justify-center text-[12px] font-bold text-rose">
                          {msg.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={msg.avatar_url} alt={msg.display_name} className="w-full h-full object-cover" />
                          ) : (
                            getInitial(msg.display_name)
                          )}
                        </div>
                        {msg.user_id && onlineUserIds.has(msg.user_id) && (
                          <span
                            className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-paper"
                            title={t('online_now')}
                          />
                        )}
                      </div>

                      {/* Bubble + meta */}
                      <div className={`flex flex-col gap-0.5 max-w-[76%] ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && (
                          <span className="text-[10.5px] text-muted/60 px-1 leading-none">{msg.display_name}</span>
                        )}

                        <div
                          className={`text-[13.5px] leading-snug rounded-2xl break-words
                            ${msg.has_attachment
                              ? `p-1 bg-transparent text-ink ${isMe ? 'rounded-br-none' : 'rounded-bl-none'}`
                              : isMe
                                ? 'px-3.5 py-2 bg-[#f0e8ed] text-ink rounded-br-none'
                                : isMentioned
                                  ? 'px-3.5 py-2 bg-amber-50 border border-amber-200 text-ink rounded-bl-none'
                                  : 'px-3.5 py-2 bg-white border border-line/60 text-ink rounded-bl-none'
                            }${msg.is_pinned ? ' ring-1 ring-amber-300/60' : ''}`}
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {msg.reply_to_id && (
                            <button
                              onClick={() => msg.reply_to_id && scrollToMessage(msg.reply_to_id)}
                              className={`w-full text-left text-[11.5px] border-l-2 pl-2 mb-1.5 rounded-sm cursor-pointer hover:opacity-80 transition-opacity border-rose/30 text-muted/70`}
                            >
                              <p className="font-semibold text-[10.5px] mb-0.5">{msg.reply_to_display_name}</p>
                              <p className="leading-snug line-clamp-2">
                                {msg.reply_to_message
                                  ? (msg.reply_to_message.length > 80 ? msg.reply_to_message.slice(0, 80) + '…' : msg.reply_to_message)
                                  : t('deleted_msg')}
                              </p>
                            </button>
                          )}

                          {msg.has_attachment && (() => {
                            const att = msg.attachments?.[0]
                            const url = att ? signedUrls[att.storage_path] : null
                            const isFileAtt = att && !att.mime_type.startsWith('image/')
                            return (
                              <div className="mt-0.5 -mx-0.5">
                                {!att ? (
                                  <div className="w-40 h-12 rounded-lg bg-muted/10 animate-pulse" />
                                ) : isFileAtt ? (
                                  // File card
                                  <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 min-w-[200px] max-w-[260px] ${
                                    isMe ? 'bg-white/70 border-rose/15' : 'bg-cream/60 border-line/60'
                                  }`}>
                                    <span className="text-[22px] shrink-0 leading-none">{getFileIcon(att.mime_type)}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] font-medium text-ink truncate leading-tight">
                                        {att.file_name ?? t('file_label')}
                                      </p>
                                      <p className="text-[10.5px] text-muted/60 mt-0.5">{formatFileSize(att.file_size)}</p>
                                    </div>
                                    {url ? (
                                      <a
                                        href={url}
                                        download={att.file_name ?? true}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-none w-7 h-7 rounded-lg bg-rose/10 hover:bg-rose/20 flex items-center justify-center transition-colors shrink-0"
                                        title={t('download_file')}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <svg className="w-3.5 h-3.5 text-rose" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </a>
                                    ) : (
                                      <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 animate-spin text-muted/30" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                ) : !url ? (
                                  <div className="w-40 h-28 rounded-lg bg-muted/10 flex items-center justify-center">
                                    <svg className="w-5 h-5 animate-spin text-muted/30" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                  </div>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={url}
                                    alt={att.file_name ?? t('image_label')}
                                    onClick={() => setLightboxUrl(url)}
                                    className="rounded-lg max-w-[220px] max-h-[260px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onError={(e) => {
                                      const target = e.currentTarget
                                      target.style.display = 'none'
                                      const parent = target.parentElement
                                      if (parent) {
                                        const errDiv = document.createElement('div')
                                        errDiv.className = 'text-[11px] text-muted/60 px-1 py-1'
                                        errDiv.textContent = t('error_image_load')
                                        parent.appendChild(errDiv)
                                      }
                                    }}
                                  />
                                )}
                                {msg.message !== '[image]' && msg.message !== '[file]' && (
                                  <p className="mt-1 text-[12.5px] leading-snug text-ink">
                                    {renderMessageContent(msg.message, msg.mentioned_names, displayName)}
                                  </p>
                                )}
                              </div>
                            )
                          })()}

                          {!msg.has_attachment && (
                            editingMsgId === msg.id ? (
                              <div className="space-y-1.5 min-w-[180px]">
                                <textarea
                                  value={editInput}
                                  onChange={(e) => setEditInput(e.target.value)}
                                  maxLength={500}
                                  autoFocus
                                  rows={2}
                                  className="w-full text-[16px] sm:text-[13px] px-2 py-1.5 rounded-lg border border-rose/30 bg-white text-ink resize-none focus:outline-none focus:border-rose/50"
                                  style={{ maxHeight: '80px', overflowY: 'auto' }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg.id) }
                                    if (e.key === 'Escape') setEditingMsgId(null)
                                  }}
                                />
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => setEditingMsgId(null)}
                                    className="text-[11px] px-2 py-0.5 rounded-lg transition-colors text-muted hover:bg-cream"
                                  >
                                    {t('cancel')}
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(msg.id)}
                                    disabled={!editInput.trim() || editSaving}
                                    className="text-[11px] px-2 py-0.5 rounded-lg font-medium transition-colors disabled:opacity-40 bg-rose text-white hover:bg-rose-deep"
                                  >
                                    {editSaving ? '…' : t('save_edit')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              renderMessageContent(msg.message, msg.mentioned_names, displayName)
                            )
                          )}
                        </div>

                        {/* Reactions */}
                        {msgReactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {msgReactions.map(r => (
                              <button
                                key={r.emoji}
                                onClick={(e) => { e.stopPropagation(); handleReact(msg.id, r.emoji) }}
                                className={`flex items-center gap-0.5 text-[13px] px-1.5 py-0.5 rounded-full border transition-all ${
                                  r.hasMyReaction
                                    ? 'bg-rose/10 border-rose/30 text-rose font-semibold'
                                    : 'bg-cream border-line text-ink hover:border-rose/20'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="text-[11px] tabular-nums">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}


                        {/* Meta + action menu */}
                        <div className={`flex items-center gap-1.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-[10px] text-muted/40 leading-none tabular-nums">
                            {formatTokyo(msg.created_at)}
                          </span>
                          {msg.edited_at && (
                            <span className="text-[9.5px] text-muted/30 italic leading-none">{t('edited_label')}</span>
                          )}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (openMenuMsgId === msg.id) {
                                  setOpenMenuMsgId(null)
                                  setMenuPos(null)
                                  return
                                }
                                const rect = e.currentTarget.getBoundingClientRect()
                                const menuWidth = 180
                                const menuHeight = 300
                                const spaceBelow = window.innerHeight - rect.bottom - 8
                                const top = spaceBelow > menuHeight
                                  ? rect.bottom + 6
                                  : Math.max(8, rect.top - menuHeight - 6)
                                let left = isMe ? Math.max(8, rect.right - menuWidth) : rect.left
                                if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8
                                if (left < 8) left = 8
                                setMenuPos({ top, left })
                                setOpenMenuMsgId(msg.id)
                              }}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                openMenuMsgId === msg.id
                                  ? 'text-ink bg-cream opacity-100'
                                  : 'text-muted/50 hover:text-ink hover:bg-cream/80 opacity-60 sm:opacity-0 sm:group-hover:opacity-100'
                              }`}
                              title={t('msg_options')}
                              aria-label={t('msg_options')}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <circle cx="4" cy="10" r="1.5"/>
                                <circle cx="10" cy="10" r="1.5"/>
                                <circle cx="16" cy="10" r="1.5"/>
                              </svg>
                            </button>
                            {openMenuMsgId === msg.id && menuPos && (
                              <div
                                className="fixed z-[9999] bg-paper border border-line rounded-xl shadow-lg overflow-hidden min-w-[170px]"
                                style={{ top: menuPos.top, left: menuPos.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => { openEmojiPicker(msg.id); setOpenMenuMsgId(null) }}
                                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream transition-colors text-left"
                                >
                                  <span className="w-4 text-center text-[15px] leading-none">😊</span>
                                  <span>{t('react_to_msg')}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    const previewText = msg.has_attachment
                                      ? msg.message === '[image]' ? `📷 ${t('image_label')}`
                                        : msg.message === '[file]' ? `📎 ${t('file_label')}`
                                        : msg.attachments?.[0]?.mime_type.startsWith('image/') ? `📷 ${msg.message}` : `📎 ${msg.message}`
                                      : msg.message
                                    setReplyingTo({ id: msg.id, message: previewText, display_name: msg.display_name })
                                    inputRef.current?.focus()
                                    setOpenMenuMsgId(null)
                                  }}
                                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream transition-colors text-left"
                                >
                                  <svg className="w-4 h-4 text-muted/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                  <span>{t('reply_msg')}</span>
                                </button>
                                {!msg.has_attachment && (
                                  <button
                                    onClick={() => { handleCopy(msg.message, msg.id); setOpenMenuMsgId(null) }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream transition-colors text-left"
                                  >
                                    <svg className="w-4 h-4 text-muted/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <span>{copiedMsgId === msg.id ? t('copy_msg_success') : t('copy_msg')}</span>
                                  </button>
                                )}
                                {isMe && !msg.has_attachment && editingMsgId !== msg.id && (
                                  <button
                                    onClick={() => { setEditingMsgId(msg.id); setEditInput(msg.message); setOpenMenuMsgId(null) }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream transition-colors text-left"
                                  >
                                    <svg className="w-4 h-4 text-muted/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span>{t('edit_msg')}</span>
                                  </button>
                                )}
                                <div className="my-0.5 border-t border-line/50" />
                                {isAdmin && (
                                  <button
                                    onClick={() => { msg.is_pinned ? handleUnpin(msg.id) : handlePin(msg.id); setOpenMenuMsgId(null) }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream transition-colors text-left"
                                  >
                                    <span className="w-4 text-center text-[14px] leading-none">📌</span>
                                    <span>{msg.is_pinned ? t('unpin_msg') : t('pin_msg')}</span>
                                  </button>
                                )}
                                {(isAdmin || isMe) && (
                                  <button
                                    onClick={() => { handleDelete(msg.id); setOpenMenuMsgId(null) }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors text-left"
                                  >
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>{t('delete_msg')}</span>
                                  </button>
                                )}
                                {!isMe && !isAdmin && (
                                  <button
                                    onClick={() => { handleReport(msg.id); setOpenMenuMsgId(null) }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-amber-600 hover:bg-amber-50 transition-colors text-left"
                                  >
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                    </svg>
                                    <span>{t('report_msg')}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* New messages button */}
          {newMsgCount > 0 && (
            <div className="flex-none flex justify-center py-1.5 bg-paper/80 border-t border-rose/10">
              <button
                onClick={scrollToBottom}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose bg-rose/8 hover:bg-rose/15 px-3 py-1 rounded-full transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
                {newMsgCount} {t('new_messages')}
              </button>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex-none px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2">
              <span className="text-[12px] text-red-600">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors text-[12px] shrink-0">✕</button>
            </div>
          )}

          {/* Emoji picker panel */}
          {emojiPickerTarget !== null && (
            <div
              className="flex-none border-t border-line bg-paper"
              onClick={(e) => e.stopPropagation()}
            >
              {emojiPickerTarget !== 'input' && (
                <div className="flex items-center justify-between px-3 py-1 bg-cream/50 border-b border-line">
                  <span className="text-[11px] text-muted/60">{t('react_to_msg')}</span>
                  <button onClick={() => setEmojiPickerTarget(null)} className="text-[11px] text-muted/40 hover:text-ink leading-none">✕</button>
                </div>
              )}
              {emojiData && (
                <EmojiPicker
                  data={emojiData}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onEmojiSelect={(emoji: any) => handleEmojiSelect(emoji.native)}
                  locale={locale}
                  theme="light"
                  previewPosition="none"
                  skinTonePosition="none"
                  set="native"
                  perLine={9}
                />
              )}
              {!emojiData && (
                <div className="h-10 flex items-center justify-center">
                  <svg className="w-4 h-4 animate-spin text-muted/30" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* Mention autocomplete popup */}
          {mentionQuery !== null && (
            <div className="flex-none border-t border-line bg-paper max-h-[160px] overflow-y-auto">
              {mentionLoading ? (
                <div className="px-4 py-2.5 text-[12px] text-muted/50">{t('mention_searching')}</div>
              ) : mentionUsers.length === 0 ? (
                <div className="px-4 py-2.5 text-[12px] text-muted/40">{t('mention_no_results')}</div>
              ) : (
                mentionUsers.map((u, idx) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => { e.preventDefault(); selectMention(u) }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                      idx === mentionIndex ? 'bg-rose/5 text-rose' : 'hover:bg-cream text-ink'
                    }`}
                  >
                    <div className="flex-none w-6 h-6 rounded-full bg-rose/10 flex items-center justify-center text-[11px] font-bold text-rose overflow-hidden shrink-0">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt={u.display_name} className="w-full h-full object-cover" />
                      ) : (
                        getInitial(u.display_name)
                      )}
                    </div>
                    <span className="text-[13px] font-medium truncate">{u.display_name}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Image preview bar */}
          {imagePreviewUrl && (
            <div className="flex-none px-3 py-2 border-t border-line bg-cream/50 flex items-start gap-2">
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreviewUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-line" />
                <button
                  onClick={handleRemoveImage}
                  className="absolute -top-1.5 -right-1.5 bg-ink text-cream text-[9px] rounded-full flex items-center justify-center hover:bg-rose transition-colors leading-none"
                  title={t('remove_image')}
                  style={{ width: 18, height: 18 }}
                >✕</button>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[11px] font-semibold text-muted/70 truncate">{imageFile?.name ?? ''}</p>
                <p className="text-[10.5px] text-muted/50">{imageFile ? `${(imageFile.size / 1024).toFixed(0)} KB` : ''}</p>
              </div>
            </div>
          )}

          {/* File attachment preview bar */}
          {attachFile && (
            <div className="flex-none px-3 py-2 border-t border-line bg-cream/50 flex items-center gap-2">
              <span className="text-[20px] shrink-0 leading-none">{getFileIcon(attachFile.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted/70 truncate">{attachFile.name}</p>
                <p className="text-[10.5px] text-muted/50">{formatFileSize(attachFile.size)}</p>
              </div>
              <button
                onClick={handleRemoveFile}
                className="flex-none w-5 h-5 bg-ink/10 text-ink/60 text-[9px] rounded-full flex items-center justify-center hover:bg-rose/20 hover:text-rose transition-colors leading-none shrink-0"
                title={t('remove_file')}
              >✕</button>
            </div>
          )}

          {/* Typing indicator */}
          <div className="flex-none px-4 min-h-[20px] flex items-center">
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="flex gap-0.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-[11px] text-muted/50 italic">
                  {typingUsers.length === 1
                    ? `${typingUsers[0].display_name} ${t('typing_suffix')}`
                    : typingUsers.length === 2
                      ? `${typingUsers[0].display_name}, ${typingUsers[1].display_name} ${t('typing_suffix')}`
                      : t('many_typing')}
                </span>
              </div>
            )}
          </div>

          {/* Reply preview bar */}
          {replyingTo && (
            <div className="flex-none px-3 py-2 border-t border-amber-100 bg-amber-50/50 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] font-semibold text-amber-600 mb-0.5">
                  {t('reply_to_label')} {replyingTo.display_name}
                </p>
                <p className="text-[12px] text-muted/80 leading-snug truncate">
                  {replyingTo.message.length > 80 ? replyingTo.message.slice(0, 80) + '…' : replyingTo.message}
                </p>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="flex-none text-muted/40 hover:text-ink transition-colors leading-none mt-0.5 text-[12px] shrink-0"
                title={t('cancel_reply')}
              >✕</button>
            </div>
          )}

          {/* Input area */}
          <div
            className="flex-none px-3 py-3 border-t border-line flex gap-2 items-end bg-cream/30"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={fileAttachInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openEmojiPicker('input') }}
              className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[18px] shrink-0 ${
                emojiPickerTarget === 'input'
                  ? 'bg-rose/15 text-rose'
                  : 'text-muted/50 hover:text-rose hover:bg-rose/10'
              }`}
              title={t('pick_emoji')}
            >😊</button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || loadingRoom || !!imageFile || !!attachFile}
              className="flex-none w-8 h-8 rounded-xl text-muted/50 hover:text-rose hover:bg-rose/10 flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
              title={t('send_image')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                <polyline points="21 15 16 10 5 21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => fileAttachInputRef.current?.click()}
              disabled={sending || loadingRoom || !!imageFile || !!attachFile}
              className="flex-none w-8 h-8 rounded-xl text-muted/50 hover:text-rose hover:bg-rose/10 flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
              title={t('send_file')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 350)
              }}
              placeholder={(imageFile || attachFile) ? t('add_caption') : (currentRoom ? `${currentRoom.name} — ${t('placeholder')}` : t('placeholder'))}
              disabled={sending || loadingRoom}
              maxLength={500}
              rows={1}
              className="flex-1 min-w-0 text-[16px] sm:text-[13.5px] px-3.5 py-2.5 rounded-2xl border border-line/80 bg-white focus:outline-none focus:border-rose/40 focus:ring-2 focus:ring-rose/8 placeholder:text-muted/35 disabled:opacity-50 text-ink resize-none shadow-sm"
              style={{ maxHeight: '80px', overflowY: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !imageFile && !attachFile) || sending || loadingRoom}
              className="flex-none w-10 h-10 rounded-2xl bg-rose text-white flex items-center justify-center hover:bg-rose-deep transition-all disabled:opacity-40 shrink-0 shadow-sm active:scale-95"
              title={uploading ? t('uploading') : t('send')}
            >
              {sending ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>{/* end right chat */}
      </div>{/* end 2-column container */}

      {/* Char count */}
      <p className="text-right text-[10.5px] text-muted/30 mt-1 pr-2 tabular-nums select-none">{input.length}/500</p>

      {/* ── Lightbox ────────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt={t('image_label')}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            style={{ maxWidth: 'min(90vw, 900px)', maxHeight: '90dvh' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-[16px] leading-none"
            title={t('close_image')}
          >✕</button>
        </div>
      )}

      {/* ── Create Room Modal ────────────────────────────────────────────────── */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-paper rounded-2xl shadow-xl w-full max-w-sm p-5">
            <h3 className="font-semibold text-ink text-[15px] mb-4">{t('create_room_title')}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
                placeholder={t('room_name_placeholder')}
                maxLength={50}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRoom() }}
                className="w-full px-3 py-2 text-[16px] sm:text-[13px] border border-line rounded-xl focus:outline-none focus:border-rose/50 bg-white"
              />
              <input
                type="text"
                value={createRoomDesc}
                onChange={(e) => setCreateRoomDesc(e.target.value)}
                placeholder={t('room_desc_placeholder')}
                maxLength={200}
                className="w-full px-3 py-2 text-[16px] sm:text-[13px] border border-line rounded-xl focus:outline-none focus:border-rose/50 bg-white"
              />
              {roomModalError && <p className="text-[12px] text-red-500">{roomModalError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowCreateRoom(false); setRoomModalError(null); setCreateRoomName(''); setCreateRoomDesc('') }}
                className="flex-1 py-2 text-[13px] text-muted border border-line rounded-xl hover:bg-cream transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={!createRoomName.trim() || createRoomLoading}
                className="flex-1 py-2 text-[13px] font-semibold text-white bg-rose rounded-xl hover:bg-rose-deep transition-colors disabled:opacity-40"
              >
                {createRoomLoading ? t('creating_room') : t('create_room')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Room Modal ────────────────────────────────────────────────── */}
      {showManageRoom && managingRoom && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-paper rounded-2xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '82dvh' }}>

            {/* Header */}
            <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-line">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <RoomAvatarIcon room={managingRoom} size="lg" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink text-[14px] truncate">{managingRoom.name}</h3>
                  <p className="text-[11px] text-muted/60 mt-0.5">{t('manage_room')}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowManageRoom(false); setManagingRoomId(null); setRoomModalError(null); setRoomAvatarError(null); setRoomAvatarSuccess(null) }}
                className="text-muted/40 hover:text-ink transition-colors ml-2 shrink-0"
              >✕</button>
            </div>

            {/* Avatar management */}
            <div className="flex-none px-5 py-3 border-b border-line/60">
              <p className="text-[10.5px] font-semibold text-muted/60 uppercase tracking-wide mb-2.5">{t('room_avatar')}</p>
              <div className="flex items-center gap-3">
                <RoomAvatarIcon room={managingRoom} size="xl" />
                {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <button
                      onClick={() => roomAvatarInputRef.current?.click()}
                      disabled={roomAvatarUploading}
                      className="self-start text-[12px] font-medium text-rose bg-rose/8 hover:bg-rose/15 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {roomAvatarUploading ? '…' : t('change_room_avatar')}
                    </button>
                    {managingRoom.avatar_url && !roomAvatarUploading && (
                      <button
                        onClick={handleRemoveRoomAvatar}
                        className="self-start text-[11px] text-muted/60 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        {t('remove_room_avatar')}
                      </button>
                    )}
                    {roomAvatarSuccess && <p className="text-[11px] text-emerald-600">{roomAvatarSuccess}</p>}
                    {roomAvatarError && <p className="text-[11px] text-red-500">{roomAvatarError}</p>}
                  </div>
                )}
              </div>
              <input
                ref={roomAvatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleRoomAvatarUpload}
                className="hidden"
              />
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
              <p className="text-[10.5px] font-semibold text-muted/60 uppercase tracking-wide mb-2">
                {t('room_members')}
                {!membersLoading && ` (${roomMembers.length})`}
              </p>

              {membersLoading ? (
                <div className="flex justify-center py-6">
                  <svg className="w-5 h-5 animate-spin text-rose/40" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : (
                <div className="space-y-1">
                  {roomMembers.map(member => (
                    <div key={member.user_id} className="flex items-center gap-2.5 py-1.5">
                      <div className="relative flex-none w-7 h-7 shrink-0">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-rose/10 flex items-center justify-center text-[12px] font-bold text-rose">
                          {member.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={member.avatar_url} alt={member.display_name ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            getInitial(member.display_name ?? '?')
                          )}
                        </div>
                        {onlineUserIds.has(member.user_id) && (
                          <span
                            className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-paper"
                            title={t('online_now')}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink truncate">
                          {member.display_name ?? 'Thành viên'}
                          {member.user_id === userId && <span className="text-muted/40 font-normal ml-1 text-[11px]">(bạn)</span>}
                        </p>
                        {member.role !== 'member' && (
                          <p className="text-[10.5px] text-muted/60">
                            {member.role === 'owner' ? t('role_owner') : t('role_admin')}
                          </p>
                        )}
                      </div>

                      {/* Role actions (owner only, for other members) */}
                      {member.user_id !== userId && currentUserRole === 'owner' && (
                        <div className="flex items-center gap-1">
                          {member.role === 'member' && (
                            <button
                              onClick={() => handleUpdateRole(member.user_id, 'admin')}
                              className="text-[10.5px] text-muted/60 hover:text-rose px-2 py-1 rounded-lg hover:bg-rose/5 transition-colors whitespace-nowrap"
                            >
                              {t('promote_to_admin')}
                            </button>
                          )}
                          {member.role === 'admin' && (
                            <button
                              onClick={() => handleUpdateRole(member.user_id, 'member')}
                              className="text-[10.5px] text-muted/60 hover:text-ink px-2 py-1 rounded-lg hover:bg-cream transition-colors whitespace-nowrap"
                            >
                              {t('demote_to_member')}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Remove button */}
                      {member.user_id !== userId &&
                        (currentUserRole === 'owner' || (currentUserRole === 'admin' && member.role === 'member')) && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          disabled={removingMemberId === member.user_id}
                          className="flex-none text-[10.5px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {removingMemberId === member.user_id ? '…' : t('remove_member')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add members (owner/admin) */}
            {(currentUserRole === 'owner' || currentUserRole === 'admin') && managingRoomId && (
              <div className="flex-none border-t border-line px-5 py-3">
                <p className="text-[10.5px] font-semibold text-muted/60 uppercase tracking-wide mb-2">
                  {t('add_members')}
                </p>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t('search_members_placeholder')}
                  className="w-full px-3 py-1.5 text-[16px] sm:text-[12px] border border-line rounded-lg focus:outline-none focus:border-rose/50 bg-white"
                />

                {memberSearchLoading && (
                  <p className="text-[11px] text-muted/40 py-1 px-0.5 mt-1">…</p>
                )}

                {!memberSearchLoading && memberSearchResults.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                    {memberSearchResults.map(user => {
                      const isSelected = selectedNewMembers.some(m => m.id === user.id)
                      return (
                        <button
                          key={user.id}
                          onClick={() => {
                            if (isSelected) setSelectedNewMembers(prev => prev.filter(m => m.id !== user.id))
                            else setSelectedNewMembers(prev => [...prev, user])
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected ? 'bg-rose/10 text-rose' : 'hover:bg-cream text-ink'
                          }`}
                        >
                          <div className="flex-none w-6 h-6 rounded-full overflow-hidden bg-rose/10 flex items-center justify-center text-[11px] font-bold text-rose shrink-0">
                            {user.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                            ) : (
                              getInitial(user.display_name)
                            )}
                          </div>
                          <span className="text-[12px] flex-1 truncate">{user.display_name}</span>
                          {isSelected && <span className="text-[10px] text-rose">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {!memberSearchLoading && memberSearch.length >= 2 && memberSearchResults.length === 0 && (
                  <p className="text-[11px] text-muted/40 py-1 px-0.5 mt-1">{t('no_users_found')}</p>
                )}

                {selectedNewMembers.length > 0 && (
                  <div className="mt-2 flex items-start gap-2">
                    <div className="flex-1 flex flex-wrap gap-1">
                      {selectedNewMembers.map(m => (
                        <span key={m.id} className="text-[11px] bg-rose/10 text-rose px-2 py-0.5 rounded-full flex items-center gap-1">
                          {m.display_name}
                          <button
                            onClick={() => setSelectedNewMembers(prev => prev.filter(x => x.id !== m.id))}
                            className="leading-none hover:text-rose-deep"
                          >✕</button>
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={handleAddMembers}
                      disabled={addingMembers}
                      className="flex-none text-[12px] font-semibold text-white bg-rose px-3 py-1.5 rounded-lg hover:bg-rose-deep disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      {addingMembers ? t('adding_members') : t('add_members')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error banner in modal */}
            {roomModalError && (
              <div className="flex-none px-5 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2">
                <span className="text-[12px] text-red-600">{roomModalError}</span>
                <button onClick={() => setRoomModalError(null)} className="text-red-400 text-[11px]">✕</button>
              </div>
            )}

            {/* Room actions */}
            <div className="flex-none border-t border-line px-5 py-3 flex items-center gap-2">
              {currentUserRole === 'owner' ? (
                <button
                  onClick={handleDeleteRoom}
                  disabled={roomActionLoading}
                  className="text-[12px] text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {t('delete_room')}
                </button>
              ) : (
                <button
                  onClick={handleLeaveRoom}
                  disabled={roomActionLoading}
                  className="text-[12px] text-muted/70 hover:text-ink hover:bg-cream px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {t('leave_room')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
