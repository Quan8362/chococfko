import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { categories } from '@/lib/places'
import { seedPlaces } from './actions'
import DeletePlaceButton from './DeletePlaceButton'
import { imgProxy } from '@/lib/avatar'

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: `Admin · ${t('admin_places')} · Chợ Cóc FKO` }
}
export const dynamic = 'force-dynamic'

const CAT_EMOJI: Record<string, string> = {
  landmark: '🏯', food: '🍜', sea: '🏖️', camp: '⛺',
  mountain: '🥾', park: '🌳', viet: '🥢', grocery: '🛒', izakaya: '🍺',
  japanese: '🍣', thai: '🌶️', chinese: '🥡', korean: '🥩',
  cafe_milk_tea: '☕', kids_playground: '🎠', onsen: '♨️',
}

type Row = {
  slug: string
  name: string
  area: string
  category: string
  category_label: string
  img: string | null
  body: string | null
  status: string | null
}

export default async function AdminDiaDiem({
  searchParams,
}: {
  searchParams: { cat?: string; q?: string; seeded?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const [tCat, admin_t] = await Promise.all([
    getTranslations('categories'),
    getTranslations('admin'),
  ])

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('places')
    .select('slug, name, area, category, category_label, img, body, status')
    .order('sort_order', { ascending: true })

  const dbRows: Row[] = (data as Row[]) ?? []
  const isSeeded = !error && dbRows.length > 0
  const pendingCount = dbRows.filter((r) => r.status === 'pending').length

  let shown = dbRows
  if (searchParams.cat) shown = shown.filter((p) => p.category === searchParams.cat)
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase()
    shown = shown.filter(
      (p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q)
    )
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">

      {/* ── HEADER ───────────────────────────────────────────── */}
      <div className="mb-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {admin_t('admin_dashboard_label')}
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              {admin_t('manage_places_title')}
            </h1>
            <p className="text-[14px] text-muted flex items-center gap-2">
              {isSeeded ? admin_t('n_places_in_db', { n: dbRows.length }) : admin_t('no_data_yet')}
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  ⏳ {admin_t('n_pending_label', { n: pendingCount })}
                </span>
              )}
            </p>
          </div>
          {isSeeded && (
            <form action={seedPlaces}>
              <button
                type="submit"
                title={admin_t('add_missing_tooltip')}
                className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-full border border-line bg-paper text-muted hover:bg-line hover:text-ink hover:border-ink/30 transition-all"
              >
                ➕ {admin_t('add_missing_btn')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── SUCCESS ──────────────────────────────────────────── */}
      {searchParams.seeded && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 text-[13.5px] text-emerald-800 font-semibold mb-6 flex items-center gap-2">
          <span>✅</span>
          <span>{admin_t('seed_success_msg', { n: dbRows.length })}</span>
        </div>
      )}

      {/* ── SEED BANNER ──────────────────────────────────────── */}
      {!isSeeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 grid place-items-center text-[20px] flex-none">📦</div>
            <div>
              <h2 className="font-serif font-bold text-amber-800 text-[17px] mb-1">{admin_t('no_places_in_db_heading')}</h2>
              <p className="text-amber-700 text-[13.5px] leading-relaxed max-w-[540px]">
                {admin_t('no_places_in_db_desc')}
              </p>
            </div>
          </div>
          <form action={seedPlaces}>
            <button
              type="submit"
              className="font-semibold px-6 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-all text-[14px] shadow-[0_4px_14px_-4px_rgba(245,158,11,0.5)]"
            >
              📥 {admin_t('seed_db_btn')}
            </button>
          </form>
        </div>
      )}

      {isSeeded && (
        <>
          {/* ── CATEGORY FILTER ──────────────────────────────── */}
          <div className="flex gap-1.5 flex-wrap mb-6">
            <Link
              href="/admin/places"
              className={`inline-flex items-center gap-1 px-4 py-[8px] rounded-full text-[12.5px] font-medium border transition-all ${
                !searchParams.cat
                  ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.25)]'
                  : 'bg-paper border-line text-muted hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
              }`}
            >
              📋 {admin_t('filter_all_label')}
              <span className={`text-[11px] font-bold px-1 rounded-full ${!searchParams.cat ? 'bg-white/25' : 'bg-line'}`}>
                {dbRows.length}
              </span>
            </Link>

            {categories.map((c) => {
              const count = dbRows.filter((p) => p.category === c.code).length
              const isActive = searchParams.cat === c.code
              return (
                <Link
                  key={c.code}
                  href={`/admin/places?cat=${c.code}`}
                  className={`inline-flex items-center gap-1 px-4 py-[8px] rounded-full text-[12.5px] font-medium border transition-all ${
                    isActive
                      ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.25)]'
                      : 'bg-paper border-line text-muted hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
                  }`}
                >
                  {CAT_EMOJI[c.code]} {tCat(c.code as Parameters<typeof tCat>[0])}
                  <span className={`text-[11px] font-bold px-1 rounded-full ${isActive ? 'bg-white/25' : 'bg-line'}`}>
                    {count}
                  </span>
                </Link>
              )
            })}
          </div>

          {/* ── PLACES LIST ──────────────────────────────────── */}
          <div className="space-y-2">
            {shown.map((p) => (
              <div
                key={p.slug}
                className="bg-paper border border-line rounded-xl px-4 py-3.5 flex items-center gap-4 hover:border-rose/25 hover:shadow-sm transition-all"
              >
                {/* Thumbnail */}
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none overflow-hidden shadow-sm">
                  {p.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgProxy(p.img)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14.5px] text-ink truncate leading-snug flex items-center gap-2">
                    {p.name}
                    {p.status === 'pending' && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap flex-none">
                        ⏳ {admin_t('pending')}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    <span>{CAT_EMOJI[p.category]} {tCat(p.category as Parameters<typeof tCat>[0])}</span>
                    <span className="opacity-40">·</span>
                    <span>📍 {p.area}</span>
                    {p.body && (
                      <span className="text-emerald-600 font-medium">
                        · ✓ {admin_t('has_desc')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-none">
                  <Link
                    href={`/places/${p.slug}`}
                    target="_blank"
                    className="text-[12px] text-muted hover:text-rose px-2.5 py-1.5 rounded-lg hover:bg-rose-soft border border-transparent hover:border-rose/20 transition-all"
                  >
                    👁 {admin_t('action_view')}
                  </Link>
                  <Link
                    href={`/admin/places/${p.slug}`}
                    className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all whitespace-nowrap"
                  >
                    {admin_t('action_edit')}
                  </Link>
                  <DeletePlaceButton slug={p.slug} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
