import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPost, getPostFromDb, isUuid, posts } from '@/lib/posts'
import { checkIsAdmin } from '@/lib/supabase/admin'
import SmartImg from '@/components/SmartImg'

export function generateStaticParams() {
  return posts.map((p) => ({ id: p.id }))
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const p = isUuid(params.id)
    ? await getPostFromDb(params.id)
    : getPost(params.id)
  return { title: p ? `${p.title} · Chợ Cóc FKO` : 'Chợ Cóc FKO' }
}

export default async function PostDetail({ params }: { params: { id: string } }) {
  const [postResult, isAdmin] = await Promise.all([
    isUuid(params.id) ? getPostFromDb(params.id) : Promise.resolve(getPost(params.id) ?? null),
    checkIsAdmin(),
  ])
  const post = postResult
  if (!post) notFound()

  const t = await getTranslations('common')
  const tCat = await getTranslations('categories')

  return (
    <article className="pb-16">
      <div className="relative h-[46vh] min-h-[320px] max-h-[540px] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6]">
        <SmartImg
          src={post.img.replace('/1000/750/', '/1500/900/')}
          fallback={post.imgFallback.replace('/1000/750', '/1500/900')}
          alt={post.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(36,26,23,0.8)] via-[rgba(36,26,23,0.2)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[820px] mx-auto px-7 pb-9">
            <Link
              href="/cong-dong"
              className="inline-block text-white/85 text-[13.5px] mb-3 hover:text-white"
            >
              {t('back_community')}
            </Link>
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <span className="bg-[rgba(255,253,248,0.94)] text-rose-deep text-[12px] font-bold px-3 py-[5px] rounded-full uppercase tracking-[0.5px]">
                {tCat(post.category as Parameters<typeof tCat>[0])}
              </span>
              <span className="text-gold text-[15px] tracking-[2px]">
                {'★'.repeat(post.rating)}
                <span className="text-white/40">{'★'.repeat(5 - post.rating)}</span>
              </span>
              <span className="text-white/90 text-[13px] font-semibold uppercase tracking-[0.6px]">
                📍 {post.area}
              </span>
            </div>
            <h1 className="font-serif font-black text-white text-[clamp(28px,4.6vw,48px)] leading-[1.06] tracking-[-1px] drop-shadow">
              {post.title}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto px-7 mt-8">
        <div className="flex items-center justify-between pb-6 mb-7 border-b border-line">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-full grid place-items-center text-white font-bold text-[15px]"
              style={{ background: `linear-gradient(135deg, ${post.authorColor})` }}
            >
              {post.authorInitial}
            </span>
            <div>
              <div className="font-semibold text-[15px]">{post.author}</div>
              <div className="text-[13px] text-muted">{post.date}</div>
            </div>
          </div>
          {isAdmin && isUuid(params.id) && (
            <Link
              href={`/admin/edit/${params.id}`}
              className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-500 hover:text-white transition-all"
            >
              {t('edit_admin')}
            </Link>
          )}
        </div>

        {post.body.length > 0 && post.body[0].trimStart().startsWith('<') ? (
          <div
            className="rich-content text-[#3a2d22]"
            dangerouslySetInnerHTML={{ __html: post.body[0] }}
          />
        ) : (
          post.body.map((para, i) => (
            <p
              key={i}
              className={`text-[#3a2d22] leading-[1.8] mb-5 ${
                i === 0 ? 'font-serif text-[20px]' : 'text-[16px]'
              }`}
            >
              {para}
            </p>
          ))
        )}

        <div className="mt-9 bg-paper border border-line rounded-2xl p-6 text-center">
          <p className="text-[15px] text-[#5c4d44] mb-4">
            {t('share_prompt')}
          </p>
          <Link
            href="/cong-dong/viet-bai"
            className="inline-block font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            {t('share_cta')}
          </Link>
        </div>
      </div>
    </article>
  )
}
