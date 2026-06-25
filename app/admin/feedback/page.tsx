import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import FeedbackItem, { type FeedbackView, type ReplyView, type ItemLabels } from './FeedbackItem'

export const metadata = { title: 'Admin · Góp ý · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

type DbFeedback = {
  id: string
  name: string
  email: string | null
  message: string
  type: string
  user_id: string | null
  created_at: string
  status: string | null
}

type DbReply = {
  id: string
  feedback_id: string
  message: string
  admin_email: string | null
  created_at: string
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_feedback')
  const admin = createAdminClient()

  const filter = searchParams.filter === 'unanswered' ? 'unanswered' : 'all'

  let query = admin
    .from('feedback')
    .select('id, name, email, message, type, user_id, created_at, status')
    .order('created_at', { ascending: false })
    .limit(500)
  if (filter === 'unanswered') query = query.eq('status', 'new')

  const { data, error } = await query
  if (error) console.error('[admin/feedback] fetch error:', error.message)

  const rows = (data ?? []) as DbFeedback[]

  // Count "new" for the filter badge (separate, không phụ thuộc filter hiện tại)
  const { count: newCount } = await admin
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')

  // Fetch replies cho các feedback đang hiển thị
  const repliesByFeedback: Record<string, ReplyView[]> = {}
  if (rows.length > 0) {
    const { data: replyData, error: replyErr } = await admin
      .from('feedback_replies')
      .select('id, feedback_id, message, admin_email, created_at')
      .in('feedback_id', rows.map((r) => r.id))
      .order('created_at', { ascending: true })
    if (replyErr) console.error('[admin/feedback] replies fetch error:', replyErr.message)
    for (const r of (replyData ?? []) as DbReply[]) {
      ;(repliesByFeedback[r.feedback_id] ??= []).push({
        id: r.id,
        message: r.message,
        adminEmail: r.admin_email,
        createdAtLabel: fmtDate(r.created_at),
      })
    }
  }

  const itemLabels: ItemLabels = {
    typeGeneral: t('type_general'),
    typeFeature: t('type_feature'),
    typeBug: t('type_bug'),
    member: t('user_label'),
    guest: t('guest_label'),
    statusNew: t('status_new'),
    statusReplied: t('status_replied'),
    replyPlaceholder: t('reply_placeholder'),
    replySend: t('reply_send'),
    replySending: t('reply_sending'),
    replySuccess: t('reply_success'),
    replyEmpty: t('reply_empty'),
    replyErrorSend: t('reply_error_send'),
    replyErrorGeneric: t('reply_error_generic'),
    noReplyAddress: t('no_reply_address'),
    noReplyAddressDesc: t('no_reply_address_desc'),
    historyTitle: t('history_title'),
    replyByLabel: t('reply_by_label'),
    adminFallback: t('admin_fallback'),
  }

  const FILTERS = [
    { key: 'all',        label: t('filter_all'),        href: '/admin/feedback' },
    { key: 'unanswered', label: t('filter_unanswered'), href: '/admin/feedback?filter=unanswered', count: newCount ?? 0 },
  ]

  return (
    <div className="max-w-[900px] mx-auto px-6 py-10">
      {/* HEADER */}
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('back')}
        </Link>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              💬 {t('title')}
            </h1>
            <p className="text-[14px] text-muted">{t('desc')}</p>
          </div>
          <span className="flex-none text-[13px] font-semibold px-3 py-1.5 rounded-full bg-line text-muted">
            {rows.length} {t('count_label')}
          </span>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
            ⚠️ {error.message}
            {error.message.includes('does not exist') && (
              <span className="block mt-1 text-[12px]">{t('table_missing')}</span>
            )}
          </div>
        )}
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[9px] rounded-full border transition-all ${
              filter === f.key
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.28)]'
                : 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
            }`}
          >
            {f.label}
            {typeof f.count === 'number' && (
              <span className={`text-[11px] font-bold min-w-[18px] text-center px-1 py-0.5 rounded-full ${
                filter === f.key ? 'bg-white/25 text-white' : 'bg-line text-muted'
              }`}>
                {f.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* LIST */}
      {rows.length === 0 && !error ? (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">
            📭
          </div>
          <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{t('empty_title')}</h3>
          <p className="text-[13.5px] text-muted max-w-[340px] mx-auto leading-relaxed">{t('empty_desc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const view: FeedbackView = {
              id: row.id,
              name: row.name,
              email: row.email,
              message: row.message,
              type: row.type,
              isMember: !!row.user_id,
              createdAtLabel: fmtDate(row.created_at),
              status: row.status ?? 'new',
            }
            return (
              <FeedbackItem
                key={row.id}
                feedback={view}
                replies={repliesByFeedback[row.id] ?? []}
                labels={itemLabels}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
