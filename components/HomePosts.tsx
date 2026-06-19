import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { getPostsFromDb, posts as staticPosts } from '@/lib/posts'
import type { Post } from '@/lib/posts'
import { imgProxy } from '@/lib/avatar'
import UserAvatar from '@/components/UserAvatar'

const CAT_EMOJI: Record<string, string> = {
  landmark: '🏯', food: '🍜', sea: '🏖️', camp: '⛺', mountain: '⛰️',
  park: '🌳', viet: '🥢', grocery: '🛒', izakaya: '🍺', japanese: '🍣',
  thai: '🌶️', chinese: '🥡', korean: '🥩', cafe_milk_tea: '☕', kids_playground: '🎠', onsen: '♨️',
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'text-gold' : 'text-muted/30'} style={{ fontSize: 11 }}>
          ★
        </span>
      ))}
    </span>
  )
}

export default async function HomePosts() {
  const t = await getTranslations('home')

  const dbPosts = await getPostsFromDb()
  const allPosts: Post[] = dbPosts ?? staticPosts
  const latest = allPosts.slice(0, 3)

  return (
    <section className="mt-12 sm:mt-16 py-10 sm:py-12 bg-paper border-t border-line">
      <div className="max-w-[1240px] mx-auto px-6">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
          <div>
            <h2 className="font-serif text-[clamp(22px,2.8vw,32px)] font-bold tracking-[-0.3px] leading-tight text-ink mb-1">
              {t('latest_posts_heading')}
            </h2>
            <p className="text-muted text-[13.5px]">{t('latest_posts_sub')}</p>
          </div>
          <Link
            href="/community"
            className="text-[13px] font-semibold text-rose hover:text-rose-deep transition-colors"
          >
            {t('latest_posts_more')} →
          </Link>
        </div>

        {latest.length === 0 && (
          <div className="bg-cream border border-line rounded-2xl p-10 text-center">
            <p className="text-muted text-[15px]">{t('latest_posts_empty')}</p>
            <Link
              href="/community/write?type=community"
              className="inline-flex mt-4 items-center gap-2 font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-colors"
            >
              {t('write_cta')}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {latest.map((post) => (
            <Link
              key={post.id}
              href={`/community/${post.id}`}
              className="group bg-cream border border-line rounded-2xl overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all flex flex-col"
            >
              {/* Image */}
              <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none">
                <span className="absolute top-3 left-3 z-[2] inline-flex items-center gap-1 bg-paper/95 text-ink text-[10.5px] font-semibold px-2.5 py-[4px] rounded-full shadow-sm">
                  {CAT_EMOJI[post.category]} {post.categoryLabel}
                </span>
                <Image
                  src={imgProxy(post.img)}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
                />
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal">
                    {post.area}
                  </span>
                  <StarRating rating={post.rating} />
                </div>
                <h3 className="font-serif font-bold text-[17px] leading-snug text-ink group-hover:text-rose transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-[13px] text-muted leading-[1.6] line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-2 pt-1.5 border-t border-line mt-auto">
                  <UserAvatar src={post.authorAvatar} name={post.author} size={24} />
                  <span className="text-[12px] text-muted truncate">{post.author}</span>
                  <span className="text-[11px] text-muted/70 ml-auto whitespace-nowrap">{post.date}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
