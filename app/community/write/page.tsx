import Link from 'next/link'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getPlace, getPlaceFromDb } from '@/lib/places'
import { submitPost } from '@/app/auth/actions'
import ImageUpload from '@/components/ImageUpload'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

function DraftClearer() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try { localStorage.removeItem('ccc-post-draft') } catch(e) {}`,
      }}
    />
  )
}

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: `${t('write_post')} · Chợ Cóc FKO` }
}

async function getUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

const TIP_ICONS = ['📸', '📍', '💬', '💰', '⏰', '✍️']
const TIP_KEYS = [
  'tip_photo', 'tip_location', 'tip_feeling', 'tip_cost', 'tip_time', 'tip_block',
] as const

export default async function VietBai({
  searchParams,
}: {
  searchParams: { error?: string; success?: string; type?: string; place?: string }
}) {
  // Redirect place-type requests to the dedicated place form
  if (searchParams.type === 'place') {
    redirect('/places/new')
  }

  const [user, t, tcat, tc] = await Promise.all([
    getUser(),
    getTranslations('post_form'),
    getTranslations('community'),
    getTranslations('common'),
  ])
  const tn = await getTranslations('nav')

  // Optional: writing about a specific place (linked from a place detail page)
  const place = searchParams.place
    ? (await getPlaceFromDb(searchParams.place)) ?? getPlace(searchParams.place)
    : null

  const TIPS = TIP_KEYS.map((key, i) => ({
    icon: TIP_ICONS[i],
    text: t(key as Parameters<typeof t>[0]),
  }))

  if (!user) {
    redirect('/login?error=' + encodeURIComponent(t('login_required')))
  }

  /* ── Success state ──────────────────────────────────────── */
  if (searchParams.success) {
    return (
      <div className="max-w-[520px] mx-auto px-6 py-16 text-center">
        <DraftClearer />
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 grid place-items-center text-[28px] mx-auto mb-5 shadow-sm">
          🎉
        </div>
        <h1 className="font-serif font-bold text-[26px] mb-2.5 text-ink">{t('success_heading')}</h1>
        <p className="text-[15px] text-muted mb-8 leading-[1.7]">{t('success_sub')}</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/community"
            className="inline-flex items-center font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
          >
            {t('view_community')}
          </Link>
          <Link
            href="/community/write"
            className="inline-flex items-center font-semibold text-[14px] px-6 py-3 rounded-full border border-line text-[#5c4d44] hover:bg-line transition-all"
          >
            {t('write_another')}
          </Link>
        </div>
      </div>
    )
  }

  const displayName =
    user.user_metadata?.display_name || user.email?.split('@')[0] || tn('user_default')

  return (
    <div className="max-w-[1060px] mx-auto px-6 py-10">

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <Link
        href="/community"
        className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-rose transition-colors mb-6"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back')}
      </Link>

      {/* ── 2-col layout ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-7 items-start">

        {/* ── Main form card ─────────────────────────────────── */}
        <div className="bg-paper border border-line rounded-2xl shadow-card overflow-hidden">

          {/* Card header */}
          <div className="px-7 pt-7 pb-5 border-b border-line">
            <h1 className="font-serif font-bold text-[clamp(24px,3.5vw,32px)] tracking-[-0.3px] text-ink leading-tight mb-1.5">
              {t('heading')}
            </h1>
            <p className="text-[15px] text-muted leading-relaxed mb-4">
              {t('sub')}
            </p>
            <div className="inline-flex items-center gap-2.5 bg-cream border border-line/80 rounded-full px-3.5 py-2">
              <span className="w-6 h-6 rounded-full bg-rose text-white text-[11px] font-bold grid place-items-center flex-none">
                {displayName[0].toUpperCase()}
              </span>
              <span className="text-[13px] text-muted">
                {t('writing_as')}{' '}
                <b className="text-ink font-semibold">{displayName}</b>
              </span>
            </div>
          </div>

          {/* Card form body */}
          <div className="px-7 py-6">
            {searchParams.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-[13.5px] text-red-700 mb-5 flex items-start gap-2">
                <svg className="w-4 h-4 flex-none mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {decodeURIComponent(searchParams.error)}
              </div>
            )}

            <form action={submitPost} className="space-y-5">
              <input type="hidden" name="post_type" value="community" />
              {place && <input type="hidden" name="place_slug" value={place.slug} />}

              {/* Linked place banner */}
              {place && (
                <div className="flex items-center gap-2.5 bg-rose-soft/60 border border-rose/20 rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink">
                  <span className="text-[15px] leading-none">📍</span>
                  <span>
                    {tc('write_about')} <b className="font-semibold text-rose">{place.name}</b>
                  </span>
                </div>
              )}

              {/* Row 1: Title + Area */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={t('title_label')} placeholder={t('title_hint')} name="title" />
                <Field label={t('area_label')} placeholder={t('area_hint')} name="area" />
              </div>

              {/* Row 2: Category + Rating */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                    {t('category_label')}
                  </label>
                  <div className="relative">
                    <select
                      name="category"
                      defaultValue="life"
                      className="w-full appearance-none text-[14px] px-3.5 py-2.5 pr-9 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
                    >
                      <option value="life">{tcat('cat_life')}</option>
                      <option value="paperwork">{tcat('cat_paperwork')}</option>
                      <option value="transport">{tcat('cat_transport')}</option>
                      <option value="study">{tcat('cat_study')}</option>
                      <option value="work">{tcat('cat_work')}</option>
                      <option value="story">{tcat('cat_story')}</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                    {t('rating_label')}
                  </label>
                  <div className="relative">
                    <select
                      name="rating"
                      className="w-full appearance-none text-[14px] px-3.5 py-2.5 pr-9 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
                    >
                      <option value="5">★★★★★ {t('rating_5')}</option>
                      <option value="4">★★★★☆ {t('rating_4')}</option>
                      <option value="3">★★★☆☆ {t('rating_3')}</option>
                      <option value="2">★★☆☆☆ {t('rating_2')}</option>
                      <option value="1">★☆☆☆☆ {t('rating_1')}</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Image upload */}
              <ImageUpload name="img" label={t('image_label')} />

              {/* Rich text editor */}
              <div>
                <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                  {t('content_label')}
                </label>
                <RichTextEditor
                  name="body"
                  placeholder={t('content_hint')}
                  minHeight="240px"
                />
                <p className="text-[12px] text-muted mt-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-muted/70 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('pending_note')}
                </p>
              </div>

              {/* Submit */}
              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white shadow-[0_4px_16px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
                >
                  {t('submit_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Tips sidebar ────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <div className="bg-paper border border-line rounded-2xl p-5 sticky top-[88px]">
            <h3 className="font-semibold text-[14px] text-ink mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-gold/15 grid place-items-center text-[13px]">💡</span>
              {t('tip_heading')}
            </h3>
            <ul className="space-y-3.5">
              {TIPS.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-[14px] flex-none mt-px">{tip.icon}</span>
                  <span className="text-[12.5px] text-muted leading-[1.6]">{tip.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-4 border-t border-line">
              <p className="text-[11.5px] text-muted/70 leading-relaxed">
                {t('review_note')}
              </p>
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}

function Field({
  label, placeholder, name,
}: {
  label: string; placeholder: string; name: string
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{label}</label>
      <input
        name={name}
        required
        placeholder={placeholder}
        className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all placeholder:text-muted/60 text-ink"
      />
    </div>
  )
}
