import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createTournament } from './actions'
import type { CaroTournament } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminCaroPage({ searchParams }: { searchParams: { error?: string } }) {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) redirect('/')

  const t = await getTranslations('games.caro')
  const admin = createAdminClient()

  const { data: tournaments } = await admin
    .from('caro_tournaments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  const list = (tournaments ?? []) as CaroTournament[]

  const STATUS_COLOR: Record<string, string> = {
    draft: 'bg-muted/10 text-muted',
    registration_open: 'bg-teal/10 text-teal',
    registration_closed: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-rose/10 text-rose',
    finished: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <span className="text-ink/70">{t('title')}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-serif font-bold text-[28px] text-ink mb-1">⚙️ {t('admin_create_tournament')}</h1>
          <p className="text-[13.5px] text-muted">{t('admin_manage_subtitle')}</p>
        </div>
        <Link
          href="/games/caro/tournaments"
          className="text-[12.5px] font-medium text-muted hover:text-rose transition-colors flex items-center gap-1.5"
        >
          {t('admin_view_user_page')}
        </Link>
      </div>

      {searchParams.error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
          {t('admin_error_prefix')}{decodeURIComponent(searchParams.error)}
        </div>
      )}

      {/* Create tournament form */}
      <div className="bg-paper border border-line rounded-2xl p-6 mb-8">
        <h2 className="font-serif font-bold text-[20px] text-ink mb-5">{t('admin_create_heading')}</h2>
        <form action={createTournament} className="space-y-4">
          <div>
            <label className="block text-[12.5px] font-semibold text-muted mb-1.5">
              {t('admin_field_title')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              required
              placeholder={t('admin_field_title_ph')}
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 text-ink transition-all"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_desc')}</label>
            <textarea
              name="description"
              rows={2}
              placeholder={t('admin_field_desc_ph')}
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 text-ink transition-all resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_rules')}</label>
              <textarea
                name="rules"
                rows={2}
                placeholder={t('admin_field_rules_ph')}
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 text-ink transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_prize')}</label>
              <input
                type="text"
                name="prize"
                placeholder={t('admin_field_prize_ph')}
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 text-ink transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_type')}</label>
              <select
                name="type"
                defaultValue="single_elimination"
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 text-ink"
              >
                <option value="single_elimination">{t('admin_type_single_option')}</option>
                <option value="group_stage">{t('admin_type_group_option')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_max_players')}</label>
              <select
                name="max_players"
                defaultValue="8"
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 text-ink"
              >
                <option value="4">{t('admin_players_count', { n: 4 })}</option>
                <option value="8">{t('admin_players_count', { n: 8 })}</option>
                <option value="16">{t('admin_players_count', { n: 16 })}</option>
                <option value="32">{t('admin_players_count', { n: 32 })}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_num_groups')}</label>
              <select
                name="num_groups"
                defaultValue="2"
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 text-ink"
              >
                <option value="2">{t('admin_groups_count', { n: 2 })}</option>
                <option value="4">{t('admin_groups_count', { n: 4 })}</option>
                <option value="8">{t('admin_groups_count', { n: 8 })}</option>
              </select>
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-muted mb-1.5">{t('admin_field_start_at')}</label>
              <input
                type="datetime-local"
                name="start_at"
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 text-ink"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="open_now" name="open_now" value="1" defaultChecked className="w-4 h-4 accent-rose" />
            <label htmlFor="open_now" className="text-[13.5px] text-ink">{t('admin_open_now_label')}</label>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="font-semibold text-[14px] px-8 py-3 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_14px_-4px_rgba(194,24,91,0.4)]"
            >
              {t('admin_create_btn')}
            </button>
          </div>
        </form>
      </div>

      {/* Existing tournaments */}
      <div>
        <h2 className="font-serif font-bold text-[20px] text-ink mb-4">{t('admin_list_heading', { count: list.length })}</h2>
        {list.length === 0 ? (
          <p className="text-center py-10 text-muted/60 text-[14px]">{t('admin_list_empty')}</p>
        ) : (
          <div className="space-y-2">
            {list.map(tour => (
              <Link
                key={tour.id}
                href={`/admin/caro/${tour.id}`}
                className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3.5 hover:border-rose/30 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-ink group-hover:text-rose transition-colors truncate">
                    {tour.title}
                  </p>
                  <p className="text-[11.5px] text-muted/60">
                    {t('admin_tour_meta', { count: tour.max_players, date: new Date(tour.created_at).toLocaleDateString('vi-VN') })}
                  </p>
                </div>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-none ${STATUS_COLOR[tour.status] ?? STATUS_COLOR.draft}`}>
                  {t(`tournament_status_${tour.status}` as Parameters<typeof t>[0])}
                </span>
                <svg className="w-4 h-4 text-muted/40 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
