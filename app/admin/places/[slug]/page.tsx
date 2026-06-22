import Link from 'next/link'
import { redirect } from 'next/navigation'
import loadDynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { getPlaceAllTranslations, RELATION_TYPES, type PlaceTranslation } from '@/lib/places'
import { getTagsForContent, getPopularTags } from '@/lib/tags'
import { createPublicClient } from '@/lib/supabase/public'
import { PREFECTURES } from '@/lib/japan'
import { updatePlace, approvePlace, upsertPlaceTranslation } from '../actions'
import ImageUpload from '@/components/ImageUpload'
import TagInput from '@/components/tags/TagInput'
import PlaceFieldsEditor, { type PlaceFieldsRow } from '@/components/admin/PlaceFieldsEditor'

const RichTextEditor = loadDynamic(() => import('@/components/RichTextEditor'), { ssr: false })

export const dynamic = 'force-dynamic'

type DbPlace = {
  slug: string; name: string; area: string; description: string | null; body: string | null;
  category: string; category_label: string; fee: string | null;
  map_url: string | null; photo_url: string | null;
  img: string | null; img_fallback: string | null;
  status: string | null; user_id: string | null;
  prefecture?: string | null; city?: string | null; address?: string | null;
  area_main?: string | null; nearby_place?: string | null;
  city_or_prefecture?: string | null; relation_type?: string | null;
}

const LOCALES: { code: string; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'ja', label: '日本語',      flag: '🇯🇵' },
  { code: 'ko', label: '한국어',      flag: '🇰🇷' },
  { code: 'zh', label: '中文',        flag: '🇨🇳' },
]

export default async function AdminEditPlace({ params }: { params: { slug: string } }) {
  if (!(await checkIsAdmin())) redirect('/')

  const [admin_t, common_t] = await Promise.all([
    getTranslations('admin'),
    getTranslations('common'),
  ])

  const FEE_OPTIONS = [
    { value: '', label: admin_t('fee_varies') },
    { value: 'free', label: admin_t('fee_free_label') },
    { value: 'paid', label: admin_t('fee_paid_label') },
  ]

  const admin = createAdminClient()
  const [{ data }, existingTranslations] = await Promise.all([
    admin.from('places').select('*').eq('slug', params.slug).single(),
    getPlaceAllTranslations(params.slug),
  ])
  const p = data as DbPlace | null
  if (!p) redirect('/admin/places')

  const placeId = (data as { id?: string } | null)?.id
  const [tags, popularTags] = await Promise.all([
    placeId ? getTagsForContent(admin, 'place', placeId) : Promise.resolve([]),
    getPopularTags(createPublicClient(), 12).then((ts) => ts.map((t) => t.name)),
  ])
  // Use canonical names so re-saving resolves to the same tag (no duplicates);
  // public display is localized via getLocalizedTagName elsewhere.
  const currentTagNames = tags.map((t) => t.name)

  const txMap = new Map<string, PlaceTranslation>()
  for (const tx of existingTranslations) txMap.set(tx.locale, tx)

  return (
    <div className="max-w-[760px] mx-auto px-6 py-10">
      <Link
        href="/admin/places"
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {admin_t('places_list_link')}
      </Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] leading-tight text-ink mb-1.5">
        {admin_t('edit_place_title')}
      </h1>
      <p className="text-[13.5px] text-muted mb-7 flex items-center gap-2 flex-wrap">
        <code className="bg-paper border border-line px-2 py-0.5 rounded text-[12px] font-mono">{params.slug}</code>
        <span className="opacity-30">·</span>
        <Link href={`/places/${params.slug}`} target="_blank" className="text-teal hover:underline text-[13px]">
          {admin_t('view_page_link')} →
        </Link>
      </p>
      <form action={updatePlace} className="space-y-5">
        <input type="hidden" name="slug" value={params.slug} />

        <Field label={admin_t('field_name')} name="name" defaultValue={p.name} required />

        {/* Khu vực có cấu trúc — render qua i18n, không trộn ngôn ngữ */}
        <fieldset className="border border-line rounded-xl px-4 pt-3 pb-4">
          <legend className="text-[12.5px] font-semibold text-[#5c4d44] px-1.5">{admin_t('field_area_section')}</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={admin_t('field_area_main')} name="area_main" defaultValue={p.area_main ?? ''} required />
            <Field label={admin_t('field_city_or_prefecture')} name="city_or_prefecture" defaultValue={p.city_or_prefecture ?? ''} />
          </div>
          <div className="grid sm:grid-cols-[1fr_180px] gap-4 mt-4">
            <Field label={admin_t('field_nearby_place')} name="nearby_place" defaultValue={p.nearby_place ?? ''} />
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{admin_t('field_relation')}</label>
              <select
                name="relation_type"
                defaultValue={p.relation_type ?? 'near'}
                className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
              >
                {RELATION_TYPES.map((r) => (
                  <option key={r} value={r}>{common_t(`area_relation_${r}` as Parameters<typeof common_t>[0])}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11.5px] text-muted mt-2.5">{admin_t('field_area_section_help')}</p>
        </fieldset>

        <div className="grid sm:grid-cols-[1fr_180px] gap-4">
          <Field
            label={admin_t('field_desc_short')}
            name="desc"
            defaultValue={p.description ?? ''}
            placeholder={admin_t('field_desc_placeholder')}
          />
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {admin_t('field_fee')}
            </label>
            <select
              name="fee"
              defaultValue={p.fee ?? ''}
              className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            >
              {FEE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tỉnh + Thành phố/Quận */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {admin_t('field_prefecture')}
            </label>
            <select
              name="prefecture"
              defaultValue={p.prefecture ?? 'fukuoka'}
              className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            >
              {PREFECTURES.map((pref) => (
                <option key={pref.code} value={pref.code}>{pref.name}</option>
              ))}
            </select>
          </div>
          <Field label={admin_t('field_city')} name="city" defaultValue={p.city ?? ''} />
        </div>

        {/* Địa chỉ chi tiết */}
        <Field label={admin_t('field_address')} name="address" defaultValue={p.address ?? ''} />

        {/* Google Maps + Ảnh thật */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label={admin_t('field_map_url')}
            name="map_url"
            defaultValue={p.map_url ?? ''}
            placeholder="https://www.google.com/maps/..."
          />
          <Field
            label={admin_t('field_photo_url')}
            name="photo_url"
            defaultValue={p.photo_url ?? ''}
            placeholder="https://www.google.com/search?tbm=isch&q=..."
          />
        </div>

        {/* Ảnh bìa */}
        <ImageUpload
          name="img"
          defaultValue={p.img ?? ''}
          label={`📷 ${admin_t('field_cover_img')}`}
        />

        {/* Mô tả chi tiết (rich text) */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
            {admin_t('field_body')}
          </label>
          <RichTextEditor
            name="body"
            defaultValue={p.body ?? ''}
            placeholder={admin_t('field_body_placeholder')}
            minHeight="220px"
          />
          <p className="text-[12px] text-muted mt-1">
            {admin_t('field_body_help')}
          </p>
        </div>

        {/* Tags — admin can add/remove */}
        <TagInput
          contentType="place"
          defaultTags={currentTagNames}
          popularTags={popularTags}
          suggestFields={{ title: 'name', area: 'area_main', description: 'desc' }}
        />

        {/* ── Explore Phase 1: structured, searchable, actionable fields ── */}
        <PlaceFieldsEditor p={data as unknown as PlaceFieldsRow} />

        {/* Status field — only for user-submitted places (status is not null) */}
        {p.status !== null && (
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {admin_t('field_status')}
            </label>
            <div className="relative">
              <select
                name="status"
                defaultValue={p.status ?? 'pending'}
                className="w-full appearance-none text-[14px] pl-3.5 pr-10 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
              >
                <option value="pending">⏳ {admin_t('status_pending_option')}</option>
                <option value="approved">✅ {admin_t('status_approved_option')}</option>
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-[11.5px] text-muted mt-1">
              {admin_t('status_set_approved_help')}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)] hover:bg-rose-deep transition-all"
          >
            {admin_t('save_changes')}
          </button>
          <Link
            href="/admin/places"
            className="px-7 py-3 rounded-full border border-line text-[14.5px] font-semibold text-muted hover:bg-line hover:text-ink transition-all text-center"
          >
            {admin_t('cancel')}
          </Link>
        </div>
      </form>

      {/* Quick approve form (only for pending places) */}
      {p.status === 'pending' && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13.5px] font-semibold text-amber-800">{admin_t('place_pending_alert')}</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              {admin_t('place_pending_alert_sub')}
            </p>
          </div>
          <form action={approvePlace}>
            <input type="hidden" name="slug" value={params.slug} />
            <button
              type="submit"
              className="whitespace-nowrap font-semibold text-[13px] px-5 py-2.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
            >
              ✅ {admin_t('quick_approve_btn')}
            </button>
          </form>
        </div>
      )}

      {/* ── Translations section ─────────────────────────────────────────────── */}
      <div className="mt-10 pt-8 border-t border-line">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-serif font-bold text-[22px] text-ink">🌐 {admin_t('tx_section_title')}</h2>
          <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-teal/10 text-teal border border-teal/20">
            {admin_t('tx_lang_count', { n: existingTranslations.length, total: LOCALES.length })}
          </span>
        </div>

        <div className="space-y-4">
          {LOCALES.map(({ code, label, flag }) => {
            const tx = txMap.get(code)
            const hasTx = !!tx
            return (
              <details
                key={code}
                className={`border rounded-2xl overflow-hidden ${hasTx ? 'border-emerald-200' : 'border-line'}`}
              >
                <summary className={`px-5 py-3.5 flex items-center gap-3 cursor-pointer select-none ${hasTx ? 'bg-emerald-50/40' : 'bg-cream/40'}`}>
                  <span className="text-[18px]">{flag}</span>
                  <span className="font-semibold text-[14px] text-ink flex-1">{label}</span>
                  {hasTx ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                      ✓ {admin_t('tx_has')}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      {admin_t('tx_none')}
                    </span>
                  )}
                </summary>
                <div className="px-5 py-5 bg-paper border-t border-line">
                  <form action={upsertPlaceTranslation} className="space-y-4">
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="locale" value={code} />

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12.5px] font-semibold mb-1.5 text-[#5c4d44]">
                          {admin_t('tx_field_area', { label })}
                        </label>
                        <input
                          type="text"
                          name="area"
                          defaultValue={tx?.area ?? ''}
                          placeholder={admin_t('tx_area_ph', { label })}
                          className="w-full text-[13.5px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose"
                        />
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-semibold mb-1.5 text-[#5c4d44]">
                          {admin_t('tx_field_desc', { label })}
                        </label>
                        <input
                          type="text"
                          name="short_description"
                          defaultValue={tx?.short_description ?? ''}
                          placeholder={admin_t('tx_desc_ph', { label })}
                          className="w-full text-[13.5px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12.5px] font-semibold mb-1.5 text-[#5c4d44]">
                        {admin_t('tx_field_content', { label })}
                      </label>
                      <textarea
                        name="content"
                        defaultValue={tx?.content ?? ''}
                        rows={5}
                        placeholder={admin_t('tx_content_ph')}
                        className="w-full text-[12.5px] font-mono px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose resize-y"
                      />
                    </div>

                    <button
                      type="submit"
                      className="font-semibold text-[13px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_8px_-2px_rgba(194,24,91,0.4)]"
                    >
                      {hasTx ? admin_t('tx_update') : admin_t('tx_save')}
                    </button>
                  </form>
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Field({
  label, name, defaultValue, placeholder, required,
}: {
  label: string; name: string; defaultValue?: string
  placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
      />
    </div>
  )
}
