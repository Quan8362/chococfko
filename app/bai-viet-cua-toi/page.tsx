import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { imgProxy } from '@/lib/avatar'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('my_posts_page')
  const description = t('sub')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
    robots: { index: false },
  }
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  rejected: 'bg-red-50 text-red-600 border border-red-200',
}

interface MyPost {
  id: string
  title: string
  area: string
  category_label: string
  status: string
  created_at: string
  img: string | null
}

export default async function BaiVietCuaToi() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/dang-nhap')

  const t = await getTranslations('my_posts_page')

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, area, category_label, status, created_at, img')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-[calc(100vh-160px)] py-14 px-6">
      <div className="max-w-[860px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-[-0.5px] text-ink mb-2">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[15px] text-muted">{t('sub')}</p>
        </div>

        {/* Empty state */}
        {(!posts || posts.length === 0) && (
          <div className="bg-paper border border-line rounded-2xl p-12 text-center shadow-card">
            <div className="text-[48px] mb-4">✍️</div>
            <h2 className="font-serif font-bold text-[20px] text-ink mb-2">
              {t('empty_title')}
            </h2>
            <p className="text-[14.5px] text-muted mb-7 max-w-[340px] mx-auto">
              {t('empty_sub')}
            </p>
            <Link
              href="/cong-dong/viet-bai"
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
            >
              {t('write_first')}
            </Link>
          </div>
        )}

        {/* Post list */}
        {posts && posts.length > 0 && (
          <div className="space-y-4">
            {(posts as MyPost[]).map((post) => {
              const statusKey = post.status as keyof typeof STATUS_STYLES
              const statusClass = STATUS_STYLES[statusKey] ?? STATUS_STYLES.pending
              const statusLabel = t(`status_${post.status}` as Parameters<typeof t>[0])
              const date = new Date(post.created_at).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric'
              })

              return (
                <article
                  key={post.id}
                  className="bg-paper border border-line rounded-2xl p-5 shadow-card flex gap-4 items-start hover:border-rose/30 transition-colors"
                >
                  {/* Thumbnail */}
                  {post.img && (
                    <div className="flex-none w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] hidden sm:block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgProxy(post.img)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Status + date */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${statusClass}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[12px] text-muted">{date}</span>
                      <span className="text-[12px] text-muted">· {post.category_label}</span>
                    </div>

                    <h2 className="font-serif font-bold text-[17px] text-ink leading-snug mb-1 line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="text-[12.5px] text-muted">{post.area}</p>
                  </div>

                  {/* View link — only for approved posts */}
                  {post.status === 'approved' && (
                    <Link
                      href={`/cong-dong/${post.id}`}
                      className="flex-none text-[12.5px] font-semibold text-teal hover:text-teal/80 transition-colors whitespace-nowrap self-center"
                    >
                      {t('view')}
                    </Link>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {/* Write more CTA */}
        {posts && posts.length > 0 && (
          <div className="mt-10 text-center">
            <Link
              href="/cong-dong/viet-bai"
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
            >
              ✍️ Viết thêm bài
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
