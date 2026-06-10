import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { adminDeleteMessage, adminRestoreMessage, adminPinMessage, adminUnpinMessage } from './actions'

export const metadata = { title: 'Quản lý chat · Admin Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

type FilterTab = 'all' | 'reported' | 'deleted'

type DbRoom = { id: string; key: string; name: string }

type DbMessage = {
  id: string
  user_id: string | null
  display_name: string
  message: string
  is_deleted: boolean
  is_pinned: boolean
  has_attachment: boolean
  created_at: string
  room_id: string
}

type DbReport = { message_id: string }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
}

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: { tab?: string; room?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const at = await getTranslations('admin')
  const admin = createAdminClient()

  const tab = (['all', 'reported', 'deleted'].includes(searchParams.tab ?? '')
    ? searchParams.tab : 'all') as FilterTab

  // Fetch rooms
  const { data: rooms } = await admin
    .from('community_chat_rooms')
    .select('id, key, name')
    .order('sort_order', { ascending: true })

  const roomList = (rooms ?? []) as DbRoom[]
  const selectedRoomId = searchParams.room || 'all'

  // Base query
  let query = admin
    .from('community_chat_messages')
    .select('id, user_id, display_name, message, is_deleted, is_pinned, has_attachment, created_at, room_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (selectedRoomId !== 'all') {
    query = query.eq('room_id', selectedRoomId)
  }

  if (tab === 'deleted') {
    query = query.eq('is_deleted', true)
  } else if (tab === 'all') {
    // Hiển thị cả deleted và non-deleted
  } else {
    // reported tab: lấy tất cả (filter sau)
  }

  const { data: messagesData } = await query
  const allMessages = (messagesData ?? []) as DbMessage[]

  // Fetch reports cho các messages này
  const messageIds = allMessages.map((m) => m.id)
  const { data: reportsData } = messageIds.length > 0
    ? await admin.from('community_chat_reports').select('message_id').in('message_id', messageIds)
    : { data: [] }

  const reports = (reportsData ?? []) as DbReport[]

  // Count reports per message
  const reportCounts = new Map<string, number>()
  reports.forEach((r) => {
    reportCounts.set(r.message_id, (reportCounts.get(r.message_id) ?? 0) + 1)
  })

  // Filter theo tab
  let shown = allMessages
  if (tab === 'reported') {
    shown = allMessages.filter((m) => (reportCounts.get(m.id) ?? 0) > 0)
  } else if (tab === 'deleted') {
    shown = allMessages.filter((m) => m.is_deleted)
  } else {
    shown = allMessages.filter((m) => !m.is_deleted)
  }

  const totalReported = allMessages.filter((m) => (reportCounts.get(m.id) ?? 0) > 0).length

  const TABS = [
    { key: 'all', label: at('chat_tab_all'), count: allMessages.filter(m => !m.is_deleted).length },
    { key: 'reported', label: at('chat_tab_reported'), count: totalReported },
    { key: 'deleted', label: at('chat_tab_deleted'), count: allMessages.filter(m => m.is_deleted).length },
  ]

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {at('admin_dashboard_label')}
        </Link>
        <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink">
          💬 {at('chat_title')}
        </h1>
        <p className="text-muted text-[14px] mt-1">{at('chat_page_subtitle')}</p>
      </div>

      {/* Room filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        <Link
          href={`/admin/chat?tab=${tab}&room=all`}
          className={`text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
            selectedRoomId === 'all'
              ? 'bg-ink text-cream border-ink'
              : 'border-line text-muted hover:border-ink hover:text-ink'
          }`}
        >
          {at('chat_all_rooms')}
        </Link>
        {roomList.map((room) => (
          <Link
            key={room.id}
            href={`/admin/chat?tab=${tab}&room=${room.id}`}
            className={`text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
              selectedRoomId === room.id
                ? 'bg-ink text-cream border-ink'
                : 'border-line text-muted hover:border-ink hover:text-ink'
            }`}
          >
            {room.name}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-6 gap-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/chat?tab=${t.key}&room=${selectedRoomId}`}
            className={`px-4 py-2.5 text-[13.5px] font-medium border-b-2 transition-all -mb-px ${
              tab === t.key
                ? 'border-rose text-rose'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-rose/10 text-rose' : 'bg-line text-muted'
              }`}>
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Message list */}
      {shown.length === 0 ? (
        <div className="text-center py-16 text-muted text-[14px]">{at('chat_no_messages')}</div>
      ) : (
        <div className="space-y-2">
          {shown.map((msg) => {
            const reportCount = reportCounts.get(msg.id) ?? 0
            const roomName = roomList.find((r) => r.id === msg.room_id)?.name ?? '?'

            return (
              <div
                key={msg.id}
                className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${
                  msg.is_deleted
                    ? 'bg-red-50/40 border-red-100 opacity-60'
                    : reportCount > 0
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-paper border-line'
                }`}
              >
                {/* Avatar initial */}
                <div className="flex-none w-8 h-8 rounded-full bg-rose/10 flex items-center justify-center text-[13px] font-bold text-rose shrink-0 mt-0.5">
                  {msg.display_name[0]?.toUpperCase() ?? '?'}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[13px] font-semibold text-ink">{msg.display_name}</span>
                    <span className="text-[11px] bg-line/60 text-muted px-1.5 py-0.5 rounded-md">{roomName}</span>
                    {reportCount > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">
                        🚩 {at('chat_report_count', { count: reportCount })}
                      </span>
                    )}
                    {msg.is_pinned && (
                      <span className="text-[11px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold">📌 {at('chat_pinned')}</span>
                    )}
                    {msg.is_deleted && (
                      <span className="text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-bold">{at('chat_deleted_badge')}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-ink break-words leading-snug">
                    {msg.has_attachment && <span className="mr-1">📷</span>}
                    {msg.message === '[image]' ? '' : msg.message}
                  </p>
                  <p className="text-[11px] text-muted/50 mt-1">{fmtDate(msg.created_at)}</p>
                </div>

                {/* Actions */}
                <div className="flex-none flex flex-col gap-1.5 items-end">
                  {!msg.is_deleted ? (
                    <form
                      action={async () => {
                        'use server'
                        await adminDeleteMessage(msg.id)
                      }}
                    >
                      <button
                        type="submit"
                        className="text-[12px] font-medium text-red-500 hover:text-red-700 transition-colors whitespace-nowrap"
                      >
                        {at('action_delete')}
                      </button>
                    </form>
                  ) : (
                    <form
                      action={async () => {
                        'use server'
                        await adminRestoreMessage(msg.id)
                      }}
                    >
                      <button
                        type="submit"
                        className="text-[12px] font-medium text-emerald-600 hover:text-emerald-800 transition-colors whitespace-nowrap"
                      >
                        {at('chat_restore')}
                      </button>
                    </form>
                  )}
                  {!msg.is_deleted && (
                    msg.is_pinned ? (
                      <form
                        action={async () => {
                          'use server'
                          await adminUnpinMessage(msg.id)
                        }}
                      >
                        <button
                          type="submit"
                          className="text-[12px] font-medium text-amber-600 hover:text-amber-800 transition-colors whitespace-nowrap"
                        >
                          {at('chat_unpin')}
                        </button>
                      </form>
                    ) : (
                      <form
                        action={async () => {
                          'use server'
                          await adminPinMessage(msg.id)
                        }}
                      >
                        <button
                          type="submit"
                          className="text-[12px] font-medium text-muted hover:text-amber-600 transition-colors whitespace-nowrap"
                        >
                          📌 {at('chat_pin')}
                        </button>
                      </form>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
