import Link from 'next/link'
import { redirect } from 'next/navigation'
import loadDynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { updatePlace } from '../actions'
import ImageUpload from '@/components/ImageUpload'

const RichTextEditor = loadDynamic(() => import('@/components/RichTextEditor'), { ssr: false })

export const dynamic = 'force-dynamic'

type DbPlace = {
  slug: string; name: string; area: string; description: string | null; body: string | null;
  category: string; category_label: string; fee: string | null;
  map_url: string | null; photo_url: string | null;
  img: string | null; img_fallback: string | null;
}

export default async function AdminEditPlace({ params }: { params: { slug: string } }) {
  if (!(await checkIsAdmin())) redirect('/')

  const admin_t = await getTranslations('admin')

  const FEE_OPTIONS = [
    { value: '', label: admin_t('fee_varies') },
    { value: 'free', label: admin_t('fee_free_label') },
    { value: 'paid', label: admin_t('fee_paid_label') },
  ]

  const admin = createAdminClient()
  const { data } = await admin.from('places').select('*').eq('slug', params.slug).single()
  const p = data as DbPlace | null
  if (!p) redirect('/admin/dia-diem')

  return (
    <div className="max-w-[760px] mx-auto px-6 py-10">
      <Link
        href="/admin/dia-diem"
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Danh sách địa điểm
      </Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] leading-tight text-ink mb-1.5">
        Sửa địa điểm
      </h1>
      <p className="text-[13.5px] text-muted mb-7 flex items-center gap-2 flex-wrap">
        <code className="bg-paper border border-line px-2 py-0.5 rounded text-[12px] font-mono">{params.slug}</code>
        <span className="opacity-30">·</span>
        <Link href={`/dia-diem/${params.slug}`} target="_blank" className="text-teal hover:underline text-[13px]">
          Xem trang →
        </Link>
      </p>

      <form action={updatePlace} className="space-y-5">
        <input type="hidden" name="slug" value={params.slug} />

        {/* Tên + Khu vực */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tên địa điểm" name="name" defaultValue={p.name} required />
          <Field label="Khu vực" name="area" defaultValue={p.area ?? ''} required />
        </div>

        {/* Mô tả ngắn + Chi phí */}
        <div className="grid sm:grid-cols-[1fr_180px] gap-4">
          <Field
            label="Mô tả ngắn (hiển thị trong card)"
            name="desc"
            defaultValue={p.description ?? ''}
            placeholder="VD: Đền nổi tiếng, cầu may học hành..."
          />
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              Chi phí vào cửa
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

        {/* Google Maps + Ảnh thật */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Link Google Maps"
            name="map_url"
            defaultValue={p.map_url ?? ''}
            placeholder="https://www.google.com/maps/..."
          />
          <Field
            label="Link tìm ảnh (Google Images)"
            name="photo_url"
            defaultValue={p.photo_url ?? ''}
            placeholder="https://www.google.com/search?tbm=isch&q=..."
          />
        </div>

        {/* Ảnh bìa */}
        <ImageUpload
          name="img"
          defaultValue={p.img ?? ''}
          label="📷 Ảnh bìa địa điểm"
        />

        {/* Mô tả chi tiết (rich text) */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
            Mô tả chi tiết (hiển thị trong trang địa điểm)
          </label>
          <RichTextEditor
            name="body"
            defaultValue={p.body ?? ''}
            placeholder="Viết mô tả chi tiết: cách đến, nên đi mùa nào, ăn gì, mẹo hay..."
            minHeight="220px"
          />
          <p className="text-[12px] text-muted mt-1">
            Hỗ trợ bold, italic, heading, danh sách, link, chèn ảnh giữa bài.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)] hover:bg-rose-deep transition-all"
          >
            {admin_t('save_changes')}
          </button>
          <Link
            href="/admin/dia-diem"
            className="px-7 py-3 rounded-full border border-line text-[14.5px] font-semibold text-muted hover:bg-line hover:text-ink transition-all text-center"
          >
            {admin_t('cancel')}
          </Link>
        </div>
      </form>
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
