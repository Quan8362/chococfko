import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getConfessionById, getConfessionComments, relativeConfessionDate, isUuid } from '@/lib/confessions'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import AnonAvatar from '@/components/AnonAvatar'
import { generateAnonId } from '@/lib/anon'
import ConfessionComments from './ConfessionComments'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const c = await getConfessionById(params.id)
  return { title: c ? `${c.title} · FKO Confessions` : 'FKO Confessions · Chợ Cóc FKO' }
}

async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const name = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Bạn'
    return { id: user.id, name, initial: name[0].toUpperCase() }
  } catch {
    return null
  }
}

export default async function ConfessionDetailPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound()

  const [confession, isAdmin, comments, currentUser, t] = await Promise.all([
    getConfessionById(params.id),
    checkIsAdmin(),
    getConfessionComments(params.id),
    getCurrentUser(),
    getTranslations('confessions'),
  ])

  if (!confession) notFound()

  const displayName = confession.is_anonymous
    ? generateAnonId(confession.id)
    : (confession.visible_author_name ?? generateAnonId(confession.id))

  return (
    <article className="pb-20">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#fdeef5] via-[#fdf5f8] to-cream border-b border-rose/10">
        {/* Soft background blobs */}
        <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-rose/[0.06] pointer-events-none" />
        <div className="absolute top-10 -left-20 w-56 h-56 rounded-full bg-teal/[0.04] pointer-events-none" />

        <div className="max-w-[900px] mx-auto px-6 pt-8 pb-10 relative z-[1]">

          {/* Top bar: breadcrumb + admin */}
          <div className="mb-7">
            <Link
              href="/confessions"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group"
            >
              <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('backToList')}
            </Link>
          </div>

          {/* Badge */}
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3.5 py-1.5 rounded-full">
              🤫 FKO Confessions
            </span>
          </div>

          {/* Title */}
          <h1 className="font-serif font-bold text-[clamp(26px,4vw,46px)] leading-[1.13] tracking-[-0.6px] text-ink mb-7 max-w-[720px]">
            {confession.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Avatar */}
            {confession.is_anonymous ? (
              <AnonAvatar size={36} />
            ) : (
              <div className="w-9 h-9 rounded-full flex-none grid place-items-center border bg-gradient-to-br from-teal/20 to-rose/10 border-line text-[13px] font-bold text-ink/60">
                {displayName[0]?.toUpperCase() ?? '?'}
              </div>
            )}

            <div className="flex flex-col leading-tight">
              <span className="text-[13.5px] font-semibold text-ink">{displayName}</span>
              <span className="text-[11.5px] text-muted">{relativeConfessionDate(confession.created_at)}</span>
            </div>

            {comments.length > 0 && (
              <a
                href="#comments"
                className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-muted bg-white/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/80 hover:border-rose/30 hover:text-rose transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {comments.length} {t('commentCount')}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENT ───────────────────────────────────────────── */}
      <div className="max-w-[900px] mx-auto px-5 sm:px-6 mt-8">

        {/* Confession body card */}
        <div className="bg-paper rounded-2xl shadow-[0_4px_28px_-8px_rgba(36,26,23,0.12)] border border-line mb-8">
          {/* Top accent bar */}
          <div className="h-[3px] rounded-t-2xl bg-gradient-to-r from-rose/30 via-rose to-rose/30" />

          <div className="px-7 sm:px-11 pt-8 pb-9">
            {/* Opening quote mark */}
            <div
              className="font-serif text-[64px] leading-none text-rose/18 -mb-3 -mt-1 select-none"
              aria-hidden="true"
            >
              &#8220;
            </div>

            {/* Render HTML (new) or plain text (legacy) content */}
            {confession.content.trimStart().startsWith('<') ? (
              <div
                className="rich-content text-[#3a2d22] text-[17px] leading-[1.9]"
                dangerouslySetInnerHTML={{ __html: confession.content }}
              />
            ) : (
              <div className="space-y-4">
                {confession.content.split('\n').map((para, i) =>
                  para.trim() ? (
                    <p
                      key={i}
                      className={`text-[#3a2d22] leading-[1.88] ${
                        i === 0 ? 'font-serif text-[19.5px] font-medium' : 'text-[16.5px]'
                      }`}
                    >
                      {para}
                    </p>
                  ) : (
                    <div key={i} className="h-2" />
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── COMMENTS ────────────────────────────────────────── */}
        <div id="comments">
          <ConfessionComments
            confessionId={confession.id}
            comments={comments}
            currentUser={currentUser}
            isAdmin={isAdmin}
          />
        </div>

        {/* ── CTA ─────────────────────────────────────────────── */}
        <div className="relative mt-4 mb-2 overflow-hidden rounded-2xl border border-rose/15 px-7 sm:px-9 py-7">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#fdeef5] via-[#fdf8fb] to-[#eef6f9]" />
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-rose/10 pointer-events-none" />
          <div className="absolute -bottom-6 -left-4 w-20 h-20 rounded-full bg-teal/8 pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
            <div className="flex-1">
              <p className="text-[10.5px] font-bold tracking-[2px] uppercase text-rose/70 mb-2">🤫 FKO Confessions</p>
              <h3 className="font-serif font-bold text-[20px] text-ink mb-1.5 leading-snug">
                {t('ctaTitle')}
              </h3>
              <p className="text-[13.5px] text-muted leading-relaxed max-w-[400px]">
                {t('ctaSubtitle')}
              </p>
            </div>
            <Link
              href="/confessions/viet-bai"
              className="flex-none inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white hover:bg-rose-deep hover:-translate-y-px transition-all shadow-[0_4px_16px_-4px_rgba(194,24,91,0.5)] whitespace-nowrap"
            >
              ✍️ {t('writeButton')}
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
