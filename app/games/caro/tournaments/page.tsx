import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getTournaments } from './actions'
import type { CaroTournament } from './actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.caro')
  return { title: `${t('tournament_page_title')}` }
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted/10 text-muted border-muted/20',
  registration_open: 'bg-teal/10 text-teal border-teal/20',
  registration_closed: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-rose/10 text-rose border-rose/20',
  finished: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const cls = STATUS_COLOR[status] ?? STATUS_COLOR.draft
  const key = `tournament_status_${status}` as Parameters<typeof t>[0]
  return (
    <span className={`inline-flex items-center text-[10.5px] font-bold tracking-wide px-2.5 py-1 rounded-full border ${cls}`}>
      {t(key)}
    </span>
  )
}

function TournamentCard({ t, tour }: { t: (k: string, v?: Record<string, unknown>) => string; tour: CaroTournament }) {
  const isOpen = tour.status === 'registration_open'
  const isFinished = tour.status === 'finished'

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3 hover:border-rose/30 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.12)] transition-all">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-serif font-bold text-[17px] text-ink leading-snug flex-1 min-w-0">
          {tour.title}
        </h2>
        <StatusBadge status={tour.status} t={t} />
      </div>

      {tour.description && (
        <p className="text-[13px] text-muted leading-relaxed line-clamp-2">{tour.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted/70">
        <span className="flex items-center gap-1">
          <span>🏆</span>
          {t('tournament_type_single')}
        </span>
        <span className="flex items-center gap-1">
          <span>👥</span>
          {t('tournament_detail_max_players')}: {tour.max_players}
        </span>
        {tour.start_at && (
          <span className="flex items-center gap-1">
            <span>📅</span>
            {new Date(tour.start_at).toLocaleDateString('vi-VN')}
          </span>
        )}
      </div>

      {isFinished && tour.prize && (
        <p className="text-[12.5px] text-gold font-medium flex items-center gap-1.5">
          <span>🎁</span>{tour.prize}
        </p>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <Link
          href={`/games/caro/tournaments/${tour.id}`}
          className="flex-1 text-center text-[13px] font-semibold py-2.5 rounded-xl bg-ink text-white hover:bg-ink/85 transition-all"
        >
          {t('tournament_view_detail')}
        </Link>
        {isOpen && (
          <Link
            href={`/games/caro/tournaments/${tour.id}`}
            className="flex-1 text-center text-[13px] font-semibold py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_12px_-4px_rgba(194,24,91,0.4)]"
          >
            {t('tournament_join_btn')}
          </Link>
        )}
      </div>
    </div>
  )
}

type Props = { searchParams: { filter?: string } }

export default async function TournamentsPage({ searchParams }: Props) {
  const filter = searchParams.filter ?? 'all'
  const [t, supabase, isAdmin, tournaments] = await Promise.all([
    getTranslations('games.caro'),
    Promise.resolve(createClient()),
    checkIsAdmin(),
    getTournaments(filter === 'all' ? undefined : filter),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const filters = [
    { key: 'all', label: t('tournament_filter_all') },
    { key: 'open', label: t('tournament_filter_open') },
    { key: 'active', label: t('tournament_filter_active') },
    { key: 'finished', label: t('tournament_filter_finished') },
  ]

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <Link
        href="/games/caro"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('title')}
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('tournament_page_badge')}
        </span>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[clamp(24px,4vw,38px)] leading-tight tracking-[-0.4px] text-ink mb-2">
              🏆 {t('tournament_page_title')}
            </h1>
            <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
              {t('tournament_page_desc')}
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/caro"
              className="flex-none inline-flex items-center gap-2 text-[13px] font-semibold px-5 py-2.5 rounded-xl bg-ink text-white hover:bg-ink/85 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('admin_create_tournament')}
            </Link>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {filters.map(f => (
          <Link
            key={f.key}
            href={`/games/caro/tournaments?filter=${f.key}`}
            className={`text-[12.5px] font-semibold px-4 py-2 rounded-full border transition-all ${
              filter === f.key
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_-3px_rgba(194,24,91,0.4)]'
                : 'bg-paper text-muted border-line hover:border-rose/40'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Tournament list */}
      {tournaments.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-[48px] block mb-4">🏆</span>
          <p className="text-[16px] font-semibold text-ink mb-1">{t('tournament_list_empty')}</p>
          <p className="text-[13.5px] text-muted">{t('tournament_list_empty_sub')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tournaments.map(tour => (
            <TournamentCard key={tour.id} t={t as (k: string, v?: Record<string, unknown>) => string} tour={tour} />
          ))}
        </div>
      )}
    </div>
  )
}
