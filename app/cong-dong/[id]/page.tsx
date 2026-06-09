import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPost, getPostFromDb, isUuid } from '@/lib/posts'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import SmartImg from '@/components/SmartImg'
import CommentsSection, { type Comment } from '@/components/CommentsSection'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const p = isUuid(params.id)
    ? await getPostFromDb(params.id)
    : getPost(params.id)
  return { title: p ? `${p.title} · Chợ Cóc FKO` : 'Chợ Cóc FKO' }
}

export const dynamic = 'force-dynamic'

async function getComments(postId: string): Promise<Comment[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(postId)) return []
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('comments_with_author')
      .select('id, user_id, content, created_at, author_name, author_avatar')
      .eq('post_id', postId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data as Comment[]
  } catch {
    return []
  }
}

async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const t = await getTranslations('common')
    const name = user.user_metadata?.display_name || user.email?.split('@')[0] || t('you')
    return { id: user.id, name, initial: name[0].toUpperCase() }
  } catch {
    return null
  }
}

export default async function PostDetail({ params }: { params: { id: string } }) {
  const [postResult, isAdmin, comments, currentUser] = await Promise.all([
    isUuid(params.id) ? getPostFromDb(params.id) : Promise.resolve(getPost(params.id) ?? null),
    checkIsAdmin(),
    getComments(params.id),
    getCurrentUser(),
  ])
  const post = postResult
  if (!post) notFound()

  const t = await getTranslations('common')
  const tCat = await getTranslations('categories')

  return (
    <article className="pb-16">
      {/* ── HERO IMAGE ────────────────────────────────────────── */}
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

      {/* ── CONTENT ───────────────────────────────────────────── */}
      <div className="max-w-[820px] mx-auto px-7 mt-8">

        {/* Author row */}
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
        </div>

        {/* Post body */}
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

        {/* ── COMMENTS ────────────────────────────────────────── */}
        <CommentsSection
          postId={params.id}
          comments={comments}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />

        {/* ── CTA ─────────────────────────────────────────────── */}
        <div className="mt-6 bg-paper border border-line rounded-2xl p-6 text-center">
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
