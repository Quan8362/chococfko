import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAllNotifications } from '@/lib/admin/notifications'
import { markAsRead, markAllAsRead } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thông báo Admin · Chợ Cóc FKO' }

const TYPE_EMOJI: Record<string, string> = {
  new_pending_post:       '📝',
  new_pending_place:      '📍',
  new_pending_confession: '🤫',
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff} phút trước`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.floor(h / 24)} ngày trước`
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const t = await getTranslations('notifications')
  const all = await getAllNotifications(user.id, 100)

  const filter = searchParams.filter === 'unread' ? 'unread' : 'all'
  const shown = filter === 'unread' ? all.filter(n => !n.is_read) : all
  const unreadCount = all.filter(n => !n.is_read).length

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">

      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Admin
      </Link>

      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-serif font-bold text-[26px] text-ink mb-1">
            🔔 {t('page_title')}
          </h1>
          <p className="text-[13.5px] text-muted">{t('page_desc')}</p>
        </div>
        {unreadCount > 0 && (
          <form action={markAllAsRead}>
            <button
              type="submit"
              className="text-[12.5px] font-semibold px-4 py-2 rounded-xl border border-line bg-paper hover:bg-rose/5 hover:border-rose/30 hover:text-rose text-muted transition-all"
            >
              ✓ {t('mark_all_read')}
            </button>
          </form>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'all',    label: t('filter_all'),    count: all.length },
          { key: 'unread', label: t('filter_unread'), count: unreadCount },
        ].map(f => (
          <Link
            key={f.key}
            href={`/admin/notifications${f.key === 'all' ? '' : '?filter=unread'}`}
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-full border transition-all ${
              filter === f.key
                ? 'bg-rose text-white border-rose'
                : 'bg-paper border-line text-muted hover:border-rose/30 hover:text-rose'
            }`}
          >
            {f.label}
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
              filter === f.key ? 'bg-white/25' : 'bg-line'
            }`}>
              {f.count}
            </span>
          </Link>
        ))}
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 text-center">
          <p className="text-[38px] mb-3">🔕</p>
          <p className="font-serif font-bold text-[17px] text-ink mb-1">{t('empty_title')}</p>
          <p className="text-[13px] text-muted">{t('empty_sub')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(notif => (
            <div
              key={notif.id}
              className={`bg-paper border rounded-2xl p-4 flex items-start gap-3.5 transition-colors ${
                notif.is_read ? 'border-line' : 'border-amber-200 bg-amber-50/30'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[18px] flex-none mt-0.5 ${
                notif.is_read ? 'bg-cream' : 'bg-amber-100'
              }`}>
                {TYPE_EMOJI[notif.type] ?? '🔔'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className={`text-[13.5px] font-semibold ${notif.is_read ? 'text-ink/70' : 'text-ink'}`}>
                    {notif.title}
                  </p>
                  {!notif.is_read && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-none" />
                  )}
                </div>
                {notif.message && (
                  <p className="text-[12.5px] text-muted truncate mb-1">「{notif.message}」</p>
                )}
                <p className="text-[11.5px] text-muted/50">{relTime(notif.created_at)}</p>
              </div>

              <div className="flex items-center gap-2 flex-none">
                {notif.target_url && (
                  <Link
                    href={notif.target_url}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all whitespace-nowrap"
                  >
                    {t('view_btn')}
                  </Link>
                )}
                {!notif.is_read && (
                  <form action={markAsRead.bind(null, notif.id)}>
                    <button
                      type="submit"
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:border-rose/30 hover:text-rose hover:bg-rose/5 transition-all whitespace-nowrap"
                    >
                      {t('mark_read')}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
