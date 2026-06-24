import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getApprovedConfessions, getConfessionStats, relativeConfessionDate, type Confession } from '@/lib/confessions'
import { getCurrentUserAccess } from '@/lib/access-server'
import { validateRequestedScope, canAccessScope } from '@/lib/access'
import ScopeTabs from '@/components/access/ScopeTabs'
import InternalNotice from '@/components/access/InternalNotice'
import AnonAvatar from '@/components/AnonAvatar'
import UserAvatar from '@/components/UserAvatar'
import { generateAnonId } from '@/lib/anon'
import { stripHtml } from '@/lib/sanitize'

export const dynamic = 'force-dynamic'

export function generateMetadata({ searchParams }: { searchParams: { scope?: string } }) {
  const internal = searchParams.scope === 'fko_internal'
  return {
    title: 'FKO Confessions · Chợ Cóc FKO',
    ...(internal ? { robots: { index: false, follow: false } } : {}),
  }
}

type Sort = 'latest' | 'most_commented'

// ── Confession card ───────────────────────────────────────────────────────────
function ConfessionCard({ confession, t }: { confession: Confession; t: (key: string) => string }) {
  const authorName = confession.is_anonymous
    ? generateAnonId(confession.id)
    : (confession.visible_author_name ?? generateAnonId(confession.id))

  const rawPreview = confession.content.trimStart().startsWith('<')
    ? stripHtml(confession.content)
    : confession.content

  return (
    <Link
      href={`/confessions/${confession.id}`}
      className="group flex flex-col bg-paper border border-line rounded-2xl overflow-hidden hover:border-rose/30 hover:shadow-[0_6px_24px_-8px_rgba(194,24,91,0.18)] hover:-translate-y-0.5 transition-all"
    >
      <div className="flex-1 p-5 sm:p-6">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-3.5">
          {confession.is_anonymous ? (
            <AnonAvatar size={26} id={confession.id} />
          ) : (
            <UserAvatar
              src={confession.visible_author_avatar}
              name={confession.visible_author_name}
              size={26}
            />
          )}
          <span className="text-[12.5px] font-semibold text-ink/80">{authorName}</span>
          <span className="text-muted/50 text-[11px]">·</span>
          <span className="text-[11.5px] text-[#8a7d72]">{relativeConfessionDate(confession.created_at)}</span>
        </div>

        {/* Title */}
        <h3 className="font-serif font-bold text-[17.5px] leading-snug text-ink mb-2.5 line-clamp-2 group-hover:text-rose transition-colors">
          {confession.title}
        </h3>

        {/* Content preview */}
        <p className="text-[13.5px] text-[#4a3f38] leading-[1.72] line-clamp-2">
          {rawPreview}
        </p>
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-t border-line/50 bg-cream/40">
        <span className="text-[12.5px] font-semibold text-rose opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {t('readMore')}
          <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span className="ml-auto text-[12.5px] text-muted flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {confession.comment_count} {t('commentCount')}
        </span>
      </div>
    </Link>
  )
}

// ── 3 horizontal info cards ───────────────────────────────────────────────────
function InfoCards({
  t,
  stats,
}: {
  t: (key: string) => string
  stats: { confessions: number; comments: number }
}) {
  const RULES = [t('rule1'), t('rule2'), t('rule3'), t('rule4')]
  const RULE_ICONS = ['🤝', '🔒', '💬', '✅']

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8 -mt-6 relative z-10">

      {/* Card 1: What is a confession */}
      <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-9 h-9 rounded-xl bg-rose/10 grid place-items-center text-[18px] flex-none">🤫</div>
          <h3 className="font-serif font-bold text-[15.5px] text-ink leading-snug">{t('whatIsTitle')}</h3>
        </div>
        <p className="text-[13px] text-muted leading-[1.75] flex-1">{t('whatIsText')}</p>
      </div>

      {/* Card 2: Rules */}
      <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-9 h-9 rounded-xl bg-teal-soft grid place-items-center text-[18px] flex-none">📋</div>
          <h3 className="font-serif font-bold text-[15.5px] text-ink leading-snug">{t('rulesTitle')}</h3>
        </div>
        <ul className="space-y-2.5 flex-1">
          {RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-muted leading-snug">
              <span className="text-[13px] flex-none mt-px">{RULE_ICONS[i]}</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Card 3: Community stats */}
      <div className="relative bg-gradient-to-br from-[#fdeef5] via-[#fdf2f7] to-[#f9f4f0] border border-rose/20 rounded-2xl p-6 flex flex-col overflow-hidden">
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-rose/[0.07] pointer-events-none" />
        <div className="absolute -bottom-6 -left-4 w-20 h-20 rounded-full bg-teal/[0.05] pointer-events-none" />
        <div className="relative flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-rose/15 grid place-items-center text-[18px] flex-none">✨</div>
            <h3 className="font-serif font-bold text-[15.5px] text-ink leading-snug">{t('statsTitle')}</h3>
          </div>
          <div className="flex gap-7 mb-3">
            <div>
              <div className="font-serif font-bold text-[27px] text-rose leading-none">{stats.confessions}</div>
              <div className="text-[12px] text-muted mt-1.5">{t('statsConfessions')}</div>
            </div>
            <div>
              <div className="font-serif font-bold text-[27px] text-teal leading-none">{stats.comments}</div>
              <div className="text-[12px] text-muted mt-1.5">{t('commentCount')}</div>
            </div>
          </div>
          <p className="text-[12.5px] text-muted leading-[1.7] mt-auto">{t('statsHint')}</p>
        </div>
      </div>

    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function ConfessionsPage({
  searchParams,
}: {
  searchParams: { sort?: string; scope?: string }
}) {
  const sort = (searchParams.sort === 'most_commented' ? 'most_commented' : 'latest') as Sort
  const access = await getCurrentUserAccess()
  const scope = validateRequestedScope(searchParams.scope, access)
  const canInternal = canAccessScope(access, 'fko_internal')

  const [t, tAccess, confessions, stats] = await Promise.all([
    getTranslations('confessions'),
    getTranslations('access'),
    getApprovedConfessions(sort, scope),
    getConfessionStats(scope),
  ])

  const writeHref = `/confessions/write?scope=${scope}`

  const TABS = [
    { key: 'latest',         label: t('latest'),        icon: '🆕' },
    { key: 'most_commented', label: t('mostCommented'), icon: '💬' },
  ]

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#fdeef5] via-[#fdf5f8] to-cream">
        <div className="absolute -top-[120px] right-[6%] w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(194,24,91,0.10),transparent_62%)] pointer-events-none" />
        <div className="absolute -bottom-[50px] -left-[60px] w-[240px] h-[240px] rounded-full bg-[radial-gradient(circle,rgba(31,143,166,0.06),transparent_60%)] pointer-events-none" />

        <div className="max-w-[1100px] mx-auto px-6 pt-12 pb-7 relative z-[1]">
          <div className="max-w-[620px] animate-fadeup">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3.5 py-1.5 rounded-full mb-5">
              🤫 FKO Confessions
            </span>
            <h1 className="font-serif font-bold text-[clamp(30px,4.5vw,50px)] leading-[1.1] tracking-[-0.6px] mb-5 text-ink">
              {t('title')}
            </h1>
            <p className="text-[16px] text-muted max-w-[480px] mb-7 leading-[1.72]">
              {t('subtitle')}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                href={writeHref}
                className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_18px_-4px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-px transition-all"
              >
                ✍️ {t('writeButton')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <section className="pb-20 min-h-[50vh]">
        <div className="max-w-[1100px] mx-auto px-6">

          {/* ── 3 INFO CARDS ─────────────────────────────────────────────── */}
          <InfoCards t={t} stats={stats} />

          {/* ── SCOPE TABS (Cộng đồng | 🔒 Nội bộ FKO) ───────────────────── */}
          <ScopeTabs
            scope={scope}
            canInternal={canInternal}
            communityHref={`/confessions?scope=community&sort=${sort}`}
            internalHref={`/confessions?scope=fko_internal&sort=${sort}`}
            communityLabel={tAccess('confessions_community')}
            internalLabel={tAccess('confessions_internal')}
          />

          {scope === 'fko_internal' && <InternalNotice text={tAccess('internal_area_notice')} />}

          {/* ── SORT TABS — underlined, distinct from the scope toggle ────── */}
          <div className="flex items-center gap-6 mb-6 border-b border-line overflow-x-auto">
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                href={`/confessions?scope=${scope}&sort=${tab.key}`}
                className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold pb-2.5 -mb-px border-b-2 transition-all whitespace-nowrap flex-none ${
                  sort === tab.key
                    ? 'border-rose text-rose'
                    : 'border-transparent text-[#8a7d72] hover:text-ink'
                }`}
              >
                <span className="text-[12px]">{tab.icon}</span>
                {tab.label}
                {sort === tab.key && confessions.length > 0 && (
                  <span className="text-[11px] font-bold bg-rose/10 text-rose px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {confessions.length}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* ── CONFESSION LIST — full width ─────────────────────────────── */}
          {confessions.length === 0 ? (
            <div className="bg-paper border border-line rounded-2xl py-20 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose/10 to-[#fdeef5] border border-rose/20 grid place-items-center mx-auto mb-5 shadow-sm">
                <AnonAvatar size={40} />
              </div>
              <h3 className="font-serif font-bold text-[22px] text-ink mb-2.5">{t('empty')}</h3>
              <p className="text-[14px] text-muted mb-7 max-w-[320px] mx-auto leading-relaxed">
                {t('emptySubtitle' as Parameters<typeof t>[0])}
              </p>
              <Link
                href={writeHref}
                className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
              >
                ✍️ {t('writeButton')}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {confessions.map((c) => (
                <ConfessionCard key={c.id} confession={c} t={t} />
              ))}
              {/* CTA card — gives the grid an intentional terminus instead of a
                  lone orphan trailing the last full row. */}
              <Link
                href={writeHref}
                className="group flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 border-dashed border-rose/25 bg-rose-soft/40 p-6 min-h-[180px] hover:border-rose/50 hover:bg-rose-soft transition-all"
              >
                <span className="w-12 h-12 rounded-full bg-rose/10 grid place-items-center text-[22px] group-hover:scale-105 transition-transform">✍️</span>
                <span className="font-serif font-bold text-[16px] text-ink leading-snug">{t('sidebarCtaTitle')}</span>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">{t('writeButton')}</span>
              </Link>
            </div>
          )}

        </div>
      </section>
    </>
  )
}
