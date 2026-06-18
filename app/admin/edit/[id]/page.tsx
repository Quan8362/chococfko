import Link from 'next/link'
import { redirect } from 'next/navigation'
import loadDynamic from 'next/dynamic'
import { getTranslations, getLocale } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { getTagsForContent, getPopularTags, getLocalizedTagName } from '@/lib/tags'
import { createPublicClient } from '@/lib/supabase/public'
import { updatePost } from '../../actions'
import ImageUpload from '@/components/ImageUpload'
import TagInput from '@/components/tags/TagInput'

const RichTextEditor = loadDynamic(() => import('@/components/RichTextEditor'), { ssr: false })

export const dynamic = 'force-dynamic'

export default async function AdminEditPost({ params }: { params: { id: string } }) {
  if (!(await checkIsAdmin())) redirect('/')

  const admin = createAdminClient()
  const { data: post } = await admin
    .from('posts_with_author')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!post) redirect('/admin')

  const [tags, popularTags] = await Promise.all([
    getTagsForContent(admin, 'post', params.id),
    getPopularTags(createPublicClient(), 12).then((ts) => ts.map((tg) => tg.name)),
  ])
  const adminLocale = await getLocale()
  const currentTagNames = tags.map((tg) => getLocalizedTagName(tg, adminLocale))

  const [t, tf, admin_t] = await Promise.all([
    getTranslations('post_form'),
    getTranslations('filters'),
    getTranslations('admin'),
  ])

  return (
    <div className="max-w-[720px] mx-auto px-6 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {admin_t('admin_dashboard_label')}
      </Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] leading-tight text-ink mb-1.5">
        {t('heading')}
      </h1>
      <p className="text-[13.5px] text-muted mb-7">
        ID: <code className="text-[12px] bg-paper border border-line px-2 py-0.5 rounded font-mono">{params.id}</code>
      </p>
      <form action={updatePost} className="space-y-5">
        <input type="hidden" name="id" value={params.id} />

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('title_label')} name="title" defaultValue={post.title} required />
          <Field label={t('area_label')} name="area" defaultValue={post.area} required />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('category_label')}
            </label>
            <select
              name="category"
              defaultValue={post.category}
              className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
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
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('rating_label')}
            </label>
            <select
              name="rating"
              defaultValue={post.rating}
              className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            >
              <option value="5">★★★★★ {t('rating_5')}</option>
              <option value="4">★★★★☆ {t('rating_4')}</option>
              <option value="3">★★★☆☆ {t('rating_3')}</option>
              <option value="2">★★☆☆☆ {t('rating_2')}</option>
              <option value="1">★☆☆☆☆ {t('rating_1')}</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              Status
            </label>
            <select
              name="status"
              defaultValue={post.status}
              className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            >
              <option value="pending">⏳ Pending</option>
              <option value="approved">✅ Approved</option>
              <option value="rejected">❌ Rejected</option>
            </select>
          </div>
        </div>

        <ImageUpload
          name="img"
          defaultValue={post.img ?? ''}
          label={t('image_label')}
        />

        <div>
          <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
            {t('content_label')}
          </label>
          <RichTextEditor
            name="body"
            defaultValue={
              Array.isArray(post.body)
                ? post.body[0] ?? ''
                : (post.body ?? '')
            }
            minHeight="220px"
          />
          <p className="text-[12px] text-muted mt-1">
            {t('writing_as')} <b>{post.author_name || 'Anonymous'}</b>
          </p>
        </div>

        {/* Tags — admin can add/remove */}
        <TagInput
          contentType="post"
          defaultTags={currentTagNames}
          popularTags={popularTags}
          suggestFields={{ title: 'title', area: 'area', category: 'category', description: 'body' }}
        />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)] hover:bg-rose-deep transition-all"
          >
            {admin_t('save_changes')}
          </button>
          <Link
            href="/admin"
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
  label, name, defaultValue, required,
}: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full text-[14px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
      />
    </div>
  )
}
