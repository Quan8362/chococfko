import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { proxyStorageImages } from '@/lib/imageProxy'
import { getPost, getPostFromDb, getPostRating, isUuid, type Post } from '@/lib/posts'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { stripHtml } from '@/lib/sanitize'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, PUBLISHER_JSONLD, breadcrumbJsonLd, jsonLdString } from '@/lib/seo'
import SmartImg from '@/components/SmartImg'
import AuthorLink from '@/components/AuthorLink'
import CommentsSection, { type Comment } from '@/components/CommentsSection'
import StarsDisplay from '@/components/marketplace/StarsDisplay'
import PostRating from './PostRating'

/** Plain-text description from a post's excerpt or body, capped for meta tags. */
function postDescription(p: Post): string {
  const raw = p.excerpt?.trim() || stripHtml((p.body ?? []).join(' '))
  return raw.length > 200 ? `${raw.slice(0, 197).trimEnd()}…` : raw
}

function postOgImage(p: Post): string {
  return p.img && /^https?:\/\//i.test(p.img) ? p.img : DEFAULT_OG_IMAGE
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = isUuid(params.id) ? await getPostFromDb(params.id) : getPost(params.id)
  if (!p) return { title: SITE_NAME, robots: { index: false, follow: true } }

  const locale = await getLocale()
  const canonical = `${SITE_URL}/community/${params.id}`
  const description = postDescription(p)
  const image = postOgImage(p)

  return {
    title: p.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      locale: OG_LOCALE[locale] ?? 'vi_VN',
      siteName: SITE_NAME,
      title: `${p.title} · ${SITE_NAME}`,
      description,
      images: [{ url: image }],
      publishedTime: p.createdAt,
      modifiedTime: p.createdAt,
      authors: p.author ? [p.author] : undefined,
      tags: p.categoryLabel ? [p.categoryLabel] : undefined,
    },
    twitter: { card: 'summary_large_image', title: `${p.title} · ${SITE_NAME}`, description, images: [image] },
  }
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

  const rating = await getPostRating(post.id, currentUser?.id)

  const t = await getTranslations('common')
  const tCat = await getTranslations('categories')
  const tCom = await getTranslations('community')

  const COMMUNITY_CATS = ['life', 'paperwork', 'transport', 'study', 'work', 'story']
  const categoryLabel = COMMUNITY_CATS.includes(post.category)
    ? tCom(`cat_${post.category}` as Parameters<typeof tCom>[0])
    : tCat(post.category as Parameters<typeof tCat>[0])

  const canonical = `${SITE_URL}/community/${post.id}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonical}#post`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        url: canonical,
        headline: post.title,
        description: postDescription(post),
        image: postOgImage(post),
        datePublished: post.createdAt,
        dateModified: post.createdAt,
        author: { '@type': 'Person', name: post.author },
        publisher: PUBLISHER_JSONLD,
        articleSection: categoryLabel,
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: '/' },
        { name: tCom('label'), path: '/community' },
        { name: post.title, path: `/community/${post.id}` },
      ]),
    ],
  }

  return (
    <article className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      {/* ── HERO IMAGE ────────────────────────────────────────── */}
      <div className="relative h-[46vh] min-h-[320px] max-h-[540px] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6]">
        <SmartImg
          src={post.img.replace('/1000/750/', '/1500/900/')}
          fallback={post.imgFallback.replace('/1000/750', '/1500/900')}
          alt={post.title}
          className="w-full h-full object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(36,26,23,0.8)] via-[rgba(36,26,23,0.2)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[820px] mx-auto px-7 pb-9">
            <Link
              href="/community"
              className="inline-block text-white/85 text-[13.5px] mb-3 hover:text-white"
            >
              {t('back_community')}
            </Link>
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <span className="bg-[rgba(255,253,248,0.94)] text-rose-deep text-[12px] font-bold px-3 py-[5px] rounded-full uppercase tracking-[0.5px]">
                {categoryLabel}
              </span>
              {rating.count > 0 && (
                <span className="inline-flex items-center gap-1.5 text-white/90 text-[13px] font-semibold">
                  <StarsDisplay value={rating.average} className="w-4 h-4" />
                  {rating.average.toFixed(1)} · {t('rating_count', { count: rating.count })}
                </span>
              )}
              {post.area && (
                <span className="text-white/90 text-[13px] font-semibold uppercase tracking-[0.6px]">
                  📍 {post.area}
                </span>
              )}
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
              <AuthorLink
                userId={post.authorId}
                name={post.author}
                className="font-semibold text-[15px] block"
              />
              <div className="text-[13px] text-muted">{post.date}</div>
            </div>
          </div>
        </div>

        {/* Post body */}
        {post.body.length > 0 && post.body[0].trimStart().startsWith('<') ? (
          <div
            className="rich-content text-[#3a2d22]"
            dangerouslySetInnerHTML={{ __html: proxyStorageImages(post.body[0]) }}
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

        {/* ── RATING ──────────────────────────────────────────── */}
        {isUuid(params.id) && (
          <PostRating
            postId={params.id}
            average={rating.average}
            count={rating.count}
            myStars={rating.myStars}
            myReview={rating.myReview}
            isLoggedIn={!!currentUser}
          />
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
            href="/community/write"
            className="inline-block font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            {t('share_cta')}
          </Link>
        </div>
      </div>
    </article>
  )
}
