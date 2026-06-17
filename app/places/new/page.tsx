import Link from 'next/link'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { submitPlace } from '@/app/auth/actions'
import ImageUpload from '@/components/ImageUpload'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: `${t('post_place')} · Chợ Cóc FKO` }
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

export default async function DangDiaDiem({
  searchParams,
}: {
  searchParams: { error?: string; success?: string }
}) {
  const [user, t, tf, tn] = await Promise.all([
    getUser(),
    getTranslations('placeForm'),
    getTranslations('filters'),
    getTranslations('nav'),
  ])

  if (!user) {
    redirect('/dang-nhap?error=' + encodeURIComponent(t('loginRequired')))
  }

  /* ── Success state ──────────────────────────────────────── */
  if (searchParams.success) {
    return (
      <div className="max-w-[520px] mx-auto px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 grid place-items-center text-[28px] mx-auto mb-5 shadow-sm">
          🎉
        </div>
        <h1 className="font-serif font-bold text-[26px] mb-2.5 text-ink">{t('successHeading')}</h1>
        <p className="text-[15px] text-muted mb-8 leading-[1.7]">{t('successSub')}</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
          >
            {t('viewExplore')}
          </Link>
          <Link
            href="/places/new"
            className="inline-flex items-center font-semibold text-[14px] px-6 py-3 rounded-full border border-line text-[#5c4d44] hover:bg-line transition-all"
          >
            {t('addAnother')}
          </Link>
        </div>
      </div>
    )
  }

  const displayName =
    user.user_metadata?.display_name || user.email?.split('@')[0] || tn('user_default')

  return (
    <div className="max-w-[760px] mx-auto px-6 py-10">

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-rose transition-colors mb-6"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back')}
      </Link>

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-7">
        <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] leading-tight text-ink mb-1.5">
          {t('heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('sub')}</p>
      </div>

      {/* ── Error banner ────────────────────────────────────── */}
      {searchParams.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-[13.5px] text-red-700 mb-5 flex items-start gap-2">
          <svg className="w-4 h-4 flex-none mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      {/* ── Form card ───────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-2xl shadow-card overflow-hidden">

        {/* Card header */}
        <div className="px-7 pt-6 pb-5 border-b border-line flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-full bg-rose text-white text-[11px] font-bold grid place-items-center flex-none">
            {displayName[0].toUpperCase()}
          </span>
          <span className="text-[13px] text-muted">
            {t('writingAs')}{' '}
            <b className="text-ink font-semibold">{displayName}</b>
          </span>
        </div>

        {/* Form body — mirrors admin edit place form */}
        <form action={submitPlace} className="px-7 py-6 space-y-5">

          {/* Tên + Khu vực */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('nameLabel')} name="name" placeholder={t('namePlaceholder')} required />
            <Field label={t('areaLabel')} name="area" placeholder={t('areaPlaceholder')} required />
          </div>

          {/* Mô tả ngắn + Chi phí */}
          <div className="grid sm:grid-cols-[1fr_180px] gap-4">
            <Field
              label={t('descLabel')}
              name="desc"
              placeholder={t('descPlaceholder')}
            />
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                {t('feeLabel')}
              </label>
              <div className="relative">
                <select
                  name="fee"
                  className="w-full appearance-none text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose transition-all text-ink"
                >
                  <option value="">{t('feeVaries')}</option>
                  <option value="free">{t('feeFree')}</option>
                  <option value="paid">{t('feePaid')}</option>
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Chủ đề */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('categoryLabel')}
            </label>
            <div className="relative">
              <select
                name="category"
                className="w-full appearance-none text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose transition-all text-ink"
              >
                <option value="landmark">{tf('landmark')}</option>
                <option value="food">{tf('food')}</option>
                <option value="sea">{tf('sea')}</option>
                <option value="camp">{tf('camp')}</option>
                <option value="mountain">{tf('mountain')}</option>
                <option value="park">{tf('park')}</option>
                <option value="viet">{tf('viet')}</option>
                <option value="grocery">{tf('grocery')}</option>
                <option value="izakaya">{tf('izakaya')}</option>
                <option value="japanese">{tf('japanese')}</option>
                <option value="thai">{tf('thai')}</option>
                <option value="chinese">{tf('chinese')}</option>
                <option value="korean">{tf('korean')}</option>
                <option value="cafe_milk_tea">{tf('cafe_milk_tea')}</option>
                <option value="kids_playground">{tf('kids_playground')}</option>
                <option value="onsen">{tf('onsen')}</option>
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Google Maps + Link tìm ảnh */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label={t('mapUrlLabel')}
              name="map_url"
              placeholder={t('mapUrlPlaceholder')}
              type="url"
            />
            <Field
              label={t('photoUrlLabel')}
              name="photo_url"
              placeholder={t('photoUrlPlaceholder')}
              type="url"
            />
          </div>

          {/* Ảnh bìa */}
          <ImageUpload name="img" label={t('imageLabel')} />

          {/* Mô tả chi tiết */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('bodyLabel')}
            </label>
            <RichTextEditor
              name="body"
              placeholder={t('bodyPlaceholder')}
              minHeight="220px"
            />
            <p className="text-[12px] text-muted mt-2">{t('pendingNote')}</p>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)] hover:bg-rose-deep transition-all"
            >
              {t('submitBtn')}
            </button>
            <Link
              href="/"
              className="px-7 py-3 rounded-full border border-line text-[14.5px] font-semibold text-muted hover:bg-line hover:text-ink transition-all text-center"
            >
              {t('cancel')}
            </Link>
          </div>
        </form>
      </div>

      {/* ── Tips ────────────────────────────────────────────── */}
      <div className="mt-5 bg-paper border border-line rounded-2xl p-5">
        <h3 className="font-semibold text-[14px] text-ink mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-gold/15 grid place-items-center text-[13px]">💡</span>
          {t('tipHeading')}
        </h3>
        <ul className="grid sm:grid-cols-2 gap-3">
          {([t('tip1'), t('tip2'), t('tip3'), t('tip4'), t('tip5')] as string[]).map((tip, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="text-rose text-[14px] mt-0.5 flex-none">✓</span>
              <span className="text-[12.5px] text-muted leading-[1.6]">{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Field({
  label, name, placeholder, required, type = 'text',
}: {
  label: string; name: string; placeholder?: string; required?: boolean; type?: string
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all placeholder:text-muted/60 text-ink"
      />
    </div>
  )
}
