import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/posts'
import { avatarSrc } from '@/lib/avatar'
import { getUserIdentity } from '@/lib/userIdentity'
import { getSellerRatingSummary } from '@/lib/marketplace-data'
import StarsDisplay from '@/components/marketplace/StarsDisplay'

export const dynamic = 'force-dynamic'

type ProfileRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  area: string | null
  facebook_url: string | null
  instagram_url: string | null
  created_at: string | null
}

type PostCard = {
  id: string
  title: string
  area: string
  category_label: string
  created_at: string
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = await getTranslations('public_profile')
  if (!isUuid(params.id)) return { title: `${t('title')} · Chợ Cóc FKO` }
  const identity = await getUserIdentity(params.id)
  const name = identity.name || t('member_fallback')
  return { title: `${name} · Chợ Cóc FKO` }
}

export default async function PublicProfilePage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound()

  const supabase = createClient()
  const [t, locale, profileResult, authResult, identity] = await Promise.all([
    getTranslations('public_profile'),
    getLocale(),
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, area, facebook_url, instagram_url, created_at')
      .eq('id', params.id)
      .maybeSingle(),
    supabase.auth.getUser(),
    getUserIdentity(params.id),
  ])

  const profile = profileResult.data as ProfileRow | null
  // The profile may have no row yet (OAuth user) but still be a real account —
  // fall back to auth identity so the page still resolves.
  if (!profile && !identity.name) notFound()

  const viewer = authResult.data.user
  const profileId = profile?.id ?? params.id
  const isOwn = viewer?.id === profileId

  const { data: postsData } = await supabase
    .from('posts_with_author')
    .select('id, title, area, category_label, created_at')
    .eq('user_id', profileId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(20)

  const posts = (postsData ?? []) as PostCard[]
  const sellerRating = await getSellerRatingSummary(profileId)
  const name = identity.name || profile?.display_name || t('member_fallback')
  const avatarUrl = identity.avatarUrl || profile?.avatar_url || null
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-[820px] mx-auto px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <Link
        href="/cong-dong"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-6"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_community')}
      </Link>

      {/* Profile header card */}
      <div className="bg-paper border border-line rounded-2xl shadow-[0_4px_28px_-8px_rgba(36,26,23,0.1)] overflow-hidden mb-8">
        <div className="h-[3px] bg-gradient-to-r from-rose/30 via-rose to-rose/30" />
        <div className="px-6 sm:px-9 pt-8 pb-7">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc(avatarUrl)}
                alt={name}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-sm flex-none"
              />
            ) : (
              <div className="w-20 h-20 rounded-full grid place-items-center text-[28px] font-bold ring-4 ring-white shadow-sm bg-gradient-to-br from-rose/40 to-teal/40 text-ink flex-none">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
            )}

            <div className="flex-1 min-w-[200px]">
              <h1 className="font-serif font-bold text-[26px] sm:text-[30px] tracking-[-0.4px] text-ink leading-tight">
                {name}
              </h1>
              <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[13px] text-muted">
                {sellerRating.count > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <StarsDisplay value={sellerRating.average} />
                    <span className="text-ink/70">{sellerRating.average.toFixed(1)} ({sellerRating.count})</span>
                  </span>
                )}
                {profile?.area && <span>📍 {profile.area}</span>}
                {joined && <span>{t('member_since', { date: joined })}</span>}
              </div>

              {profile?.bio && (
                <p className="text-[14.5px] text-[#3a2d22] leading-relaxed mt-3 whitespace-pre-wrap break-words max-w-[520px]">
                  {profile.bio}
                </p>
              )}

              {/* Social + action */}
              <div className="flex items-center gap-2.5 flex-wrap mt-4">
                {isOwn ? (
                  <Link
                    href="/ho-so"
                    className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-cream border border-line text-ink hover:border-rose/30 transition-all"
                  >
                    {t('edit_profile')}
                  </Link>
                ) : viewer ? (
                  <Link
                    href={`/cong-dong/chat?dm=${profileId}`}
                    className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep hover:-translate-y-px transition-all shadow-[0_4px_16px_-4px_rgba(194,24,91,0.5)]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {t('message_button')}
                  </Link>
                ) : (
                  <Link
                    href="/dang-nhap"
                    className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
                  >
                    {t('login_to_message')}
                  </Link>
                )}

                {profile?.facebook_url && (
                  <a
                    href={profile.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-cream border border-line text-muted hover:text-rose hover:border-rose/30 transition-all"
                    aria-label="Facebook"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898v-2.89h2.54V9.797c0-2.507 1.492-3.892 3.777-3.892 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>
                  </a>
                )}
                {profile?.instagram_url && (
                  <a
                    href={profile.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-cream border border-line text-muted hover:text-rose hover:border-rose/30 transition-all"
                    aria-label="Instagram"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink">{t('posts_heading')}</h2>
        {posts.length > 0 && (
          <span className="text-[12.5px] font-bold px-2.5 py-0.5 rounded-full bg-rose/10 text-rose">{posts.length}</span>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-10 text-center">
          <p className="text-[14px] text-muted">{t('no_posts')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/cong-dong/${p.id}`}
              className="block bg-paper border border-line rounded-2xl px-5 py-4 hover:border-rose/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-muted mb-1">
                <span className="font-semibold text-rose uppercase tracking-[0.5px]">{p.category_label}</span>
                <span>·</span>
                <span>📍 {p.area}</span>
                <span>·</span>
                <span>{new Date(p.created_at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
              <h3 className="font-serif font-semibold text-[16.5px] text-ink leading-snug">{p.title}</h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
