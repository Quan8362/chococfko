import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import AnalyticsRecentClient, { type RecentEvent } from './AnalyticsRecentClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Admin · Analytics · Chợ Cóc FKO' }
}

type Event = {
  event_name: string
  path: string | null
  user_id: string | null
  anonymous_visitor_id: string | null
  session_id: string | null
  created_at: string
}

type Period = 'today' | '7d' | '30d'

const JST = 'Asia/Tokyo'

function getPeriodStart(period: Period): Date {
  const now = new Date()
  if (period === 'today') {
    // Midnight JST: get today's date string in Tokyo, then parse as 00:00+09:00
    const jstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)
    return new Date(`${jstDate}T00:00:00+09:00`)
  }
  const d = new Date(now)
  d.setDate(d.getDate() - (period === '7d' ? 7 : 30))
  return d
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: JST,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('vi-VN', {
    timeZone: JST, day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function getPeriodRangeLabel(period: Period, since: Date, t: (key: string, values?: Record<string, string | number>) => string): string {
  const now = new Date()
  const nowStr = now.toLocaleDateString('vi-VN', {
    timeZone: JST, day: '2-digit', month: '2-digit', year: 'numeric',
  })
  if (period === 'today') return t('analytics_period_day', { date: nowStr })
  return t('analytics_period_range', { from: fmtDate(since), to: nowStr })
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin')

  const period: Period = (['today', '7d', '30d'].includes(searchParams.period ?? '')
    ? searchParams.period as Period
    : 'today')

  const admin = createAdminClient()
  const since = getPeriodStart(period)

  const { data: rawEvents } = await admin
    .from('analytics_events')
    .select('event_name, path, user_id, anonymous_visitor_id, session_id, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(10000)

  const events: Event[] = (rawEvents ?? []) as Event[]

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const pageViews    = events.filter(e => e.event_name === 'page_view').length
  const uniqueSessions = new Set(events.map(e => e.session_id).filter(Boolean)).size
  const loggedInSet  = new Set(events.filter(e => e.user_id).map(e => e.user_id!))
  const visitorSet   = new Set(
    events.map(e => e.anonymous_visitor_id ?? e.user_id).filter(Boolean)
  )
  const uniqueVisitors   = visitorSet.size
  const loggedInVisitors = loggedInSet.size
  const anonVisitors     = Math.max(0, uniqueVisitors - loggedInVisitors)

  // Top pages
  const pathMap: Record<string, number> = {}
  events.filter(e => e.event_name === 'page_view' && e.path).forEach(e => {
    pathMap[e.path!] = (pathMap[e.path!] ?? 0) + 1
  })
  const topPages = Object.entries(pathMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Top events
  const eventMap: Record<string, number> = {}
  events.forEach(e => { eventMap[e.event_name] = (eventMap[e.event_name] ?? 0) + 1 })
  const topEvents = Object.entries(eventMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Recent 500 events passed to client for pagination/filter
  const recent: RecentEvent[] = events.slice(0, 500).map(e => ({
    event_name: e.event_name,
    path: e.path,
    user_id: e.user_id,
    created_at: e.created_at,
    formatted_time: fmtDateTime(e.created_at),
  }))

  // ── Period label ──────────────────────────────────────────────────────────
  const PERIOD_LABELS: Record<Period, string> = {
    today: t('analytics_filter_today'),
    '7d':  t('analytics_filter_7d'),
    '30d': t('analytics_filter_30d'),
  }

  const PERIODS: Period[] = ['today', '7d', '30d']

  const STATS = [
    { label: t('analytics_page_views'),  value: pageViews,        color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-l-blue-400'   },
    { label: t('analytics_visitors'),    value: uniqueVisitors,   color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-l-violet-400' },
    { label: t('analytics_sessions'),    value: uniqueSessions,   color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-l-teal-400'   },
    { label: t('analytics_logged_in'),   value: loggedInVisitors, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-l-emerald-400'},
    { label: t('analytics_anonymous'),   value: anonVisitors,     color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-l-amber-400'  },
    { label: t('analytics_total_events'),value: events.length,    color: 'text-rose',        bg: 'bg-rose-soft',  border: 'border-l-rose'       },
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
          {t('back_admin')}
        </Link>
        <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mb-1">
          📊 {t('analytics_title')}
        </h1>
        <p className="text-[13.5px] text-muted">{t('analytics_desc')}</p>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {PERIODS.map(p => (
          <Link
            key={p}
            href={`/admin/analytics?period=${p}`}
            className={`text-[13px] font-semibold px-4 py-2 rounded-full border transition-all ${
              period === p
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.28)]'
                : 'bg-paper text-muted border-line hover:bg-rose-soft hover:border-rose/30 hover:text-rose'
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>
      <p className="text-[12px] text-muted/70 mb-7">
        📅 {getPeriodRangeLabel(period, since, t)}
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        {STATS.map(s => (
          <div
            key={s.label}
            className={`${s.bg} border-l-4 ${s.border} rounded-xl px-4 py-4 shadow-sm`}
          >
            <div className={`text-[28px] font-bold leading-none mb-1.5 ${s.color}`}>
              {s.value.toLocaleString()}
            </div>
            <div className="text-[11.5px] text-muted/80 font-medium leading-snug">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">

        {/* Top pages */}
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 bg-cream/60 border-b border-line">
            <h2 className="font-serif font-bold text-[16px] text-ink">
              📄 {t('analytics_top_pages')}
            </h2>
          </div>
          {topPages.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted/60">{t('analytics_no_data')}</p>
          ) : (
            <div className="divide-y divide-line/50">
              {topPages.map(([path, count]) => (
                <div key={path} className="flex items-center justify-between px-5 py-2.5 hover:bg-cream/40 transition-colors">
                  <span className="text-[12.5px] text-ink/80 font-mono truncate flex-1 mr-3">{path}</span>
                  <span className="text-[12px] font-bold text-rose flex-none">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top events */}
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 bg-cream/60 border-b border-line">
            <h2 className="font-serif font-bold text-[16px] text-ink">
              ⚡ {t('analytics_top_events')}
            </h2>
          </div>
          {topEvents.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted/60">{t('analytics_no_data')}</p>
          ) : (
            <div className="divide-y divide-line/50">
              {topEvents.map(([evName, count]) => (
                <div key={evName} className="flex items-center justify-between px-5 py-2.5 hover:bg-cream/40 transition-colors">
                  <span className="text-[12.5px] text-ink/80 font-mono truncate flex-1 mr-3">{evName}</span>
                  <span className="text-[12px] font-bold text-rose flex-none">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity — client component with search/filter/pagination */}
      <AnalyticsRecentClient events={recent} />
    </div>
  )
}
