import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { approvePost, rejectPost, deletePost } from './actions'
import { approvePlace, rejectPlace } from './dia-diem/actions'

async function getPendingConfessionsCount(): Promise<number> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 0
  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('confessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}

export const metadata = { title: 'Admin · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border border-red-200',
}

const CAT_EMOJI: Record<string, string> = {
  landmark: '🏯', food: '🍜', sea: '🏖️', camp: '⛺',
  mountain: '⛰️', park: '🌳', viet: '🥢', grocery: '🛒', izakaya: '🍺',
  japanese: '🍣', thai: '🌶️', chinese: '🥡', korean: '🥩',
  cafe_milk_tea: '☕', kids_playground: '🎠',
}

type DbPost = {
  id: string
  title: string
  category: string
  category_label: string
  area: string
  rating: number
  status: string
  created_at: string
  author_name: string | null
}

type DbPendingPlace = {
  slug: string
  name: string
  area: string
  category: string
  category_label: string
  img: string | null
  status: string
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const [admin_t, tCat] = await Promise.all([
    getTranslations('admin'),
    getTranslations('categories'),
  ])

  const admin = createAdminClient()
  const pendingConfessionsCount = await getPendingConfessionsCount()

  // Fetch community posts
  const { data: postsData, error: postsError } = await admin
    .from('posts_with_author')
    .select('id, title, category, category_label, area, rating, status, created_at, author_name')
    .order('created_at', { ascending: false })

  const all: DbPost[] = (postsData as DbPost[]) ?? []
  if (postsError) console.error('[admin] posts fetch error:', postsError.message)

  // Fetch pending places separately
  const { data: pendingPlacesData } = await admin
    .from('places')
    .select('slug, name, area, category, category_label, img, status')
    .eq('status', 'pending')
    .order('sort_order', { ascending: false })

  const pendingPlaces: DbPendingPlace[] = (pendingPlacesData as DbPendingPlace[]) ?? []

  const byStatus = {
    pending:  all.filter((p) => p.status === 'pending'),
    approved: all.filter((p) => p.status === 'approved'),
    rejected: all.filter((p) => p.status === 'rejected'),
  }

  const tab = (['pending', 'approved', 'rejected', 'all'].includes(searchParams.tab ?? '')
    ? searchParams.tab
    : 'pending') as Tab

  const shown = tab === 'all' ? all : byStatus[tab]

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const STATUS_LABEL: Record<string, string> = {
    pending:  admin_t('pending'),
    approved: admin_t('approved'),
    rejected: admin_t('rejected'),
  }

  const TABS = [
    { key: 'pending',  label: admin_t('pending'),  count: byStatus.pending.length,  emoji: '⏳' },
    { key: 'approved', label: admin_t('approved'),  count: byStatus.approved.length, emoji: '✅' },
    { key: 'rejected', label: admin_t('rejected'),  count: byStatus.rejected.length, emoji: '❌' },
    { key: 'all',      label: admin_t('all'),        count: all.length,                emoji: '📋' },
  ]

  const EMPTY: Record<Tab, { title: string; sub: string }> = {
    pending:  { title: admin_t('empty_pending_title'),  sub: admin_t('empty_pending_sub') },
    approved: { title: admin_t('empty_approved_title'), sub: admin_t('empty_approved_sub') },
    rejected: { title: admin_t('empty_rejected_title'), sub: admin_t('empty_rejected_sub') },
    all:      { title: admin_t('empty_all_title'),      sub: admin_t('empty_all_sub') },
  }

  const totalPending = byStatus.pending.length + pendingPlaces.length

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">

      {/* ── HEADER ───────────────────────────────────────────── */}
      <div className="mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {admin_t('back_home')}
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              {admin_t('dashboard_title')}
            </h1>
            <p className="text-[14px] text-muted">{admin_t('dashboard_sub')}</p>
          </div>

          {/* Total pending alert badge */}
          {totalPending > 0 && (
            <div className="flex-none inline-flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-[22px] font-bold text-amber-600 leading-none">{totalPending}</span>
              <div>
                <div className="text-[12px] font-semibold text-amber-700 leading-tight">{admin_t('posts_pending')}</div>
                <div className="text-[11px] text-amber-500">{admin_t('click_view')}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── QUICK NAV ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
        {/* Posts – active */}
        <div className="relative bg-rose-soft border border-rose/20 rounded-2xl p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-rose/6 rounded-full pointer-events-none" />
          <div className="absolute -bottom-6 -right-4 w-16 h-16 bg-rose/4 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-rose/15 grid place-items-center text-[20px] mb-3.5 flex-none">
              📝
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1">{admin_t('posts_title')}</h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">{admin_t('posts_desc')}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose bg-rose/10 px-2.5 py-1 rounded-full">
              {admin_t('viewing')}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>

        {/* Confessions */}
        <Link
          href="/admin/confessions"
          className="relative bg-paper border border-line rounded-2xl p-5 overflow-hidden hover:border-rose/35 hover:bg-rose-soft/30 hover:-translate-y-0.5 hover:shadow-card transition-all group"
        >
          {pendingConfessionsCount > 0 && (
            <span className="absolute top-3 right-3 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-white">
              ⏳ {pendingConfessionsCount}
            </span>
          )}
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-rose/5 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-rose-soft grid place-items-center text-[20px] mb-3.5 flex-none">
              🤫
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1 group-hover:text-rose transition-colors">
              FKO Confessions
            </h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">{admin_t('confessions_desc')}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose bg-rose-soft px-2.5 py-1 rounded-full">
              {admin_t('manage')}
              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        {/* Places */}
        <Link
          href="/admin/dia-diem"
          className="relative bg-paper border border-line rounded-2xl p-5 overflow-hidden hover:border-teal/35 hover:bg-teal-soft/40 hover:-translate-y-0.5 hover:shadow-card transition-all group"
        >
          {pendingPlaces.length > 0 && (
            <span className="absolute top-3 right-3 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-white">
              ⏳ {pendingPlaces.length}
            </span>
          )}
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-teal/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-6 -right-4 w-16 h-16 bg-teal/3 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-teal-soft grid place-items-center text-[20px] mb-3.5 flex-none">
              📍
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1 group-hover:text-teal transition-colors">
              {admin_t('places_title')}
            </h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">{admin_t('places_desc')}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal bg-teal-soft px-2.5 py-1 rounded-full">
              {admin_t('manage')}
              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        {/* Users */}
        <Link
          href="/admin/users"
          className="relative bg-paper border border-line rounded-2xl p-5 overflow-hidden hover:border-rose/35 hover:bg-rose-soft/30 hover:-translate-y-0.5 hover:shadow-card transition-all group"
        >
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-rose/4 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-rose-soft grid place-items-center text-[20px] mb-3.5 flex-none">
              👥
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1 group-hover:text-rose transition-colors">
              {admin_t('users_title')}
            </h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">{admin_t('users_desc')}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose bg-rose-soft px-2.5 py-1 rounded-full">
              {admin_t('users_view_list')}
              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        {/* Chat */}
        <Link
          href="/admin/chat"
          className="relative bg-paper border border-line rounded-2xl p-5 overflow-hidden hover:border-violet-300 hover:bg-violet-50/30 hover:-translate-y-0.5 hover:shadow-card transition-all group"
        >
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-violet-500/4 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-violet-50 grid place-items-center text-[20px] mb-3.5 flex-none">
              💬
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1 group-hover:text-violet-600 transition-colors">
              Quản lý Chat
            </h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">Duyệt và xóa tin nhắn cộng đồng</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
              {admin_t('manage')}
              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        {/* Analytics */}
        <Link
          href="/admin/analytics"
          className="relative bg-paper border border-line rounded-2xl p-5 overflow-hidden hover:border-blue-300 hover:bg-blue-50/30 hover:-translate-y-0.5 hover:shadow-card transition-all group"
        >
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-blue-500/4 rounded-full pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-blue-50 grid place-items-center text-[20px] mb-3.5 flex-none">
              📊
            </div>
            <h2 className="font-serif font-bold text-[16.5px] text-ink mb-1 group-hover:text-blue-600 transition-colors">
              {admin_t('analytics_title')}
            </h2>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">{admin_t('analytics_desc')}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              {admin_t('analytics_view')}
              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>
      </div>

      {/* ── PENDING PLACES SECTION ───────────────────────────── */}
      {pendingPlaces.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink">
              📍 {admin_t('pending_places_heading')}
            </h2>
            <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              {admin_t('n_pending_label', { n: pendingPlaces.length })}
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingPlaces.map((place) => (
              <div
                key={place.slug}
                className="bg-amber-50/40 border border-amber-200/70 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-amber-300 transition-all"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none overflow-hidden shadow-sm">
                  {place.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={place.img} alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-semibold px-2 py-[4px] rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      ⏳ {admin_t('pending')}
                    </span>
                    <span className="text-[12px] text-muted">
                      {CAT_EMOJI[place.category]} {tCat(place.category as Parameters<typeof tCat>[0])}
                    </span>
                    <span className="text-[12px] text-muted">📍 {place.area}</span>
                  </div>
                  <h3 className="font-serif font-bold text-[16px] leading-snug text-ink truncate">
                    {place.name}
                  </h3>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap sm:flex-nowrap flex-none">
                  <Link
                    href={`/admin/dia-diem/${place.slug}`}
                    className="text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all whitespace-nowrap"
                  >
                    {admin_t('action_edit')}
                  </Link>

                  <form action={approvePlace}>
                    <input type="hidden" name="slug" value={place.slug} />
                    <input type="hidden" name="from" value="dashboard" />
                    <button
                      type="submit"
                      className="text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    >
                      {admin_t('action_approve')}
                    </button>
                  </form>

                  <form action={rejectPlace}>
                    <input type="hidden" name="slug" value={place.slug} />
                    <input type="hidden" name="from" value="dashboard" />
                    <button
                      type="submit"
                      className="text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    >
                      {admin_t('action_reject')}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STATS (community posts only) ─────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink">
          📝 {admin_t('community_posts_heading')}
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { key: 'all',      label: admin_t('total'),    count: all.length,                borderColor: 'border-l-gold',         numColor: 'text-ink',         cardBg: '' },
          { key: 'pending',  label: admin_t('pending'),  count: byStatus.pending.length,   borderColor: 'border-l-amber-400',    numColor: 'text-amber-600',   cardBg: byStatus.pending.length > 0 ? 'bg-amber-50/50' : '' },
          { key: 'approved', label: admin_t('approved'), count: byStatus.approved.length,  borderColor: 'border-l-emerald-400',  numColor: 'text-emerald-600', cardBg: '' },
          { key: 'rejected', label: admin_t('rejected'), count: byStatus.rejected.length,  borderColor: 'border-l-red-400',      numColor: 'text-red-500',     cardBg: '' },
        ].map((s) => (
          <Link
            key={s.key}
            href={`/admin?tab=${s.key}`}
            className={`${s.cardBg || 'bg-paper'} border-l-4 ${s.borderColor} shadow-card rounded-xl p-4 hover:shadow-card-hover transition-all ${tab === s.key ? 'ring-1 ring-rose/30 ring-offset-1' : ''}`}
          >
            <div className={`text-[32px] font-bold leading-none mb-1.5 ${s.numColor}`}>{s.count}</div>
            <div className="text-[12px] text-muted font-medium">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map((tabItem) => (
          <Link
            key={tabItem.key}
            href={`/admin?tab=${tabItem.key}`}
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[9px] rounded-full border transition-all ${
              tab === tabItem.key
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.28)]'
                : 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
            }`}
          >
            <span className="text-[11px]">{tabItem.emoji}</span>
            {tabItem.label}
            <span className={`text-[11px] font-bold min-w-[18px] text-center px-1 py-0.5 rounded-full ${
              tab === tabItem.key ? 'bg-white/25 text-white' : 'bg-line text-muted'
            }`}>
              {tabItem.count}
            </span>
          </Link>
        ))}
      </div>

      {/* ── COMMUNITY POST LIST ──────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">
            📭
          </div>
          <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{EMPTY[tab].title}</h3>
          <p className="text-[13.5px] text-muted max-w-[300px] mx-auto leading-relaxed mb-5">
            {EMPTY[tab].sub}
          </p>
          {tab !== 'all' && (
            <Link
              href="/admin?tab=all"
              className="inline-block text-[13px] font-semibold px-5 py-2 rounded-full border border-line bg-cream hover:bg-line transition-colors text-[#5c4d44]"
            >
              {admin_t('view_all_posts')}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((post) => (
            <div
              key={post.id}
              className="bg-paper border border-line rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4 hover:border-rose/25 hover:shadow-sm transition-all"
            >
              {/* INFO */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full ${STATUS_BADGE[post.status]}`}>
                    {STATUS_LABEL[post.status] ?? post.status}
                  </span>
                  <span className="text-[12px] text-muted">
                    {CAT_EMOJI[post.category]} {tCat(post.category as Parameters<typeof tCat>[0])}
                  </span>
                  <span className="text-[12px] text-muted">📍 {post.area}</span>
                  <span className="text-gold text-[12px] tracking-wide">{'★'.repeat(post.rating)}</span>
                </div>

                <h3 className="font-serif font-bold text-[17px] leading-snug mb-1.5 text-ink truncate">
                  {post.title}
                </h3>

                <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                  <span>
                    {admin_t('author_label')}{' '}
                    <b className="text-[#5c4d44] font-semibold">{post.author_name || admin_t('anonymous')}</b>
                  </span>
                  <span className="opacity-30">·</span>
                  <span>{fmtDate(post.created_at)}</span>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:flex-col sm:min-w-[120px]">
                <Link
                  href={`/admin/edit/${post.id}`}
                  className="flex-1 sm:flex-none text-center text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all whitespace-nowrap"
                >
                  {admin_t('action_edit')}
                </Link>

                {post.status !== 'approved' && (
                  <form action={approvePost} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={post.id} />
                    <button
                      type="submit"
                      className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    >
                      {admin_t('action_approve')}
                    </button>
                  </form>
                )}

                {post.status !== 'rejected' && (
                  <form action={rejectPost} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={post.id} />
                    <button
                      type="submit"
                      className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    >
                      {admin_t('action_reject')}
                    </button>
                  </form>
                )}

                <form action={deletePost} className="flex-1 sm:flex-none">
                  <input type="hidden" name="id" value={post.id} />
                  <button
                    type="submit"
                    className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                  >
                    {admin_t('action_delete')}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
