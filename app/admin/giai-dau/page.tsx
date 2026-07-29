import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { listTournamentsForAdmin } from '@/lib/tournaments/admin/queries'
import {
  TOURNAMENT_STATUS_FILTERS,
  isTournamentStatusFilter,
  type TournamentStatus,
  type TournamentStatusFilter,
} from '@/lib/tournaments/admin/types'
import StatusBadge from '@/components/tournaments/admin/StatusBadge'
import TournamentStatusActions from '@/components/tournaments/admin/TournamentStatusActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quản lý giải đấu' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function AdminTournamentsPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  // Defense-in-depth: the /admin layout already gates, but every admin page re-guards.
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_tournaments')

  const filter: TournamentStatusFilter = isTournamentStatusFilter(searchParams.filter)
    ? searchParams.filter
    : 'all'

  let items: Awaited<ReturnType<typeof listTournamentsForAdmin>> | null = null
  let loadError = false
  try {
    items = await listTournamentsForAdmin(filter)
  } catch {
    loadError = true
  }

  const statusLabel = (s: TournamentStatus) => t(`status_${s}`)

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-6 py-10 pb-20">
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[28px] sm:text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              🏆 {t('list_title')}
            </h1>
            <p className="text-[14px] text-muted">{t('list_sub')}</p>
          </div>
          <Link
            href="/admin/giai-dau/new"
            className="flex-none font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            + {t('create_cta')}
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TOURNAMENT_STATUS_FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/giai-dau?filter=${f}`}
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[9px] rounded-full border transition-all ${
              filter === f
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.28)]'
                : 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
            }`}
          >
            {t(`filter_${f}`)}
          </Link>
        ))}
      </div>

      {/* States */}
      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl py-12 px-8 text-center">
          <div className="text-[22px] mb-3">⚠️</div>
          <h3 className="font-serif font-bold text-[17px] text-ink mb-1">{t('load_error_title')}</h3>
          <p className="text-[13.5px] text-muted">{t('load_error_sub')}</p>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">
            🏆
          </div>
          <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{t('empty_title')}</h3>
          <p className="text-[13.5px] text-muted max-w-[320px] mx-auto leading-relaxed mb-5">{t('empty_sub')}</p>
          <Link
            href="/admin/giai-dau/new"
            className="inline-block font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            + {t('create_cta')}
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => (
            <div
              key={it.id}
              className="bg-paper border border-line rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:border-rose/25 hover:shadow-sm transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <StatusBadge status={it.status} label={statusLabel(it.status)} />
                  <span className="text-[12px] text-muted font-mono">/{it.slug}</span>
                </div>
                <h3 className="font-serif font-bold text-[17px] leading-snug text-ink truncate">{it.name}</h3>
                <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span>📅 {fmtDate(it.startsAt)} → {fmtDate(it.endsAt)}</span>
                  {it.location && <span>📍 {it.location}</span>}
                  <span>🎯 {t('events_count', { count: it.eventCount })}</span>
                  <span>🕒 {fmtDate(it.updatedAt)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:items-end lg:min-w-[240px]">
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={`/admin/giai-dau/${it.id}`}
                    className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-cream text-[#5c4d44] border border-line hover:border-rose/35 hover:text-rose transition-all"
                  >
                    {t('action_view')}
                  </Link>
                  <Link
                    href={`/admin/giai-dau/${it.id}/edit`}
                    className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
                  >
                    {t('action_edit')}
                  </Link>
                </div>
                <TournamentStatusActions
                  id={it.id}
                  status={it.status}
                  eventCount={it.eventCount}
                  updatedAt={it.updatedAt}
                  variant="list"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
