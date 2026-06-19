import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { approveConfession, rejectConfession, deleteConfession, adminDeleteConfessionComment } from './actions'
import ConfirmDeleteButton from './ConfirmDeleteButton'
import AnonAvatar from '@/components/AnonAvatar'
import { generateAnonId } from '@/lib/anon'
import { stripHtml } from '@/lib/sanitize'

export const metadata = { title: 'Admin · Confessions · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

type RawConfession = {
  id: string
  title: string
  content: string
  author_id: string | null
  is_anonymous: boolean
  status: string
  community_scope: string
  created_at: string
  approved_at: string | null
  rejected_reason: string | null
}

type DbConfession = RawConfession & {
  author_name: string | null
  comment_count: number
}

type DbComment = {
  id: string
  confession_id: string
  user_id: string | null
  content: string
  is_anonymous: boolean
  status: string
  created_at: string
  author_name: string | null
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border border-red-200',
  deleted:  'bg-gray-100 text-gray-500 border border-gray-200',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminConfessionsPage({
  searchParams,
}: {
  searchParams: { tab?: string; comments?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const [t, admin_t, tAccess] = await Promise.all([
    getTranslations('confessions'),
    getTranslations('admin'),
    getTranslations('access'),
  ])
  const admin = createAdminClient()

  // ── 1. Fetch confessions — NO embedded relation (author_id → auth.users, not profiles)
  const { data: rawConfessions, error: confErr } = await admin
    .from('confessions')
    .select('id, title, content, author_id, is_anonymous, status, community_scope, created_at, approved_at, rejected_reason')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (confErr) {
    console.error('[admin/confessions] fetch error:', confErr.message)
  }

  const rows = (rawConfessions ?? []) as RawConfession[]

  // ── 2. Fetch author display names separately
  const uniqueAuthorIds = Array.from(
    new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))
  )
  const authorMap: Record<string, string> = {}
  if (uniqueAuthorIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', uniqueAuthorIds)
    for (const p of (profileRows ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) authorMap[p.id] = p.display_name
    }
  }

  // ── 3. Fetch comment counts
  const { data: commentCounts } = await admin
    .from('confession_comments')
    .select('confession_id')
    .eq('status', 'approved')
    .is('deleted_at', null)

  const countMap: Record<string, number> = {}
  for (const row of (commentCounts ?? []) as { confession_id: string }[]) {
    countMap[row.confession_id] = (countMap[row.confession_id] ?? 0) + 1
  }

  // ── 4. Build full objects
  const all: DbConfession[] = rows.map((row) => ({
    ...row,
    author_name: row.author_id ? (authorMap[row.author_id] ?? null) : null,
    comment_count: countMap[row.id] ?? 0,
  }))

  const byStatus = {
    pending:  all.filter((c) => c.status === 'pending'),
    approved: all.filter((c) => c.status === 'approved'),
    rejected: all.filter((c) => c.status === 'rejected'),
  }

  const tab = (['pending', 'approved', 'rejected', 'all'].includes(searchParams.tab ?? '')
    ? searchParams.tab
    : 'pending') as Tab

  const shown = tab === 'all' ? all : byStatus[tab]

  // ── 5. Fetch recent comments (optional panel)
  const showComments = searchParams.comments === '1'
  let recentComments: DbComment[] = []
  if (showComments) {
    const { data: commentData } = await admin
      .from('confession_comments')
      .select('id, confession_id, user_id, content, is_anonymous, status, created_at')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const commentUserIds = Array.from(new Set(
      ((commentData ?? []) as { user_id: string | null }[])
        .map((r) => r.user_id)
        .filter((id): id is string => !!id)
    ))
    const commentAuthorMap: Record<string, string> = {}
    if (commentUserIds.length > 0) {
      const { data: cProfiles } = await admin
        .from('profiles')
        .select('id, display_name')
        .in('id', commentUserIds)
      for (const p of (cProfiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) commentAuthorMap[p.id] = p.display_name
      }
    }

    recentComments = ((commentData ?? []) as {
      id: string; confession_id: string; user_id: string | null
      content: string; is_anonymous: boolean; status: string; created_at: string
    }[]).map((row) => ({
      id: row.id,
      confession_id: row.confession_id,
      user_id: row.user_id,
      content: row.content,
      is_anonymous: row.is_anonymous,
      status: row.status,
      created_at: row.created_at,
      author_name: row.user_id ? (commentAuthorMap[row.user_id] ?? null) : null,
    }))
  }

  const TABS = [
    { key: 'pending',  label: t('status.pending'),  count: byStatus.pending.length,  emoji: '⏳' },
    { key: 'approved', label: t('status.approved'),  count: byStatus.approved.length, emoji: '✅' },
    { key: 'rejected', label: t('status.rejected'),  count: byStatus.rejected.length, emoji: '❌' },
    { key: 'all',      label: admin_t('filter_all_label'), count: all.length,             emoji: '📋' },
  ]

  const EMPTY: Record<Tab, string> = {
    pending:  admin_t('empty_pending_confessions'),
    approved: admin_t('empty_approved_confessions'),
    rejected: admin_t('empty_rejected_confessions'),
    all:      admin_t('empty_all_confessions'),
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {admin_t('admin_dashboard_label')}
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              🤫 FKO Confessions
            </h1>
            <p className="text-[14px] text-muted">{admin_t('confessions_desc')}</p>
          </div>
          {byStatus.pending.length > 0 && (
            <div className="flex-none inline-flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-[22px] font-bold text-amber-600 leading-none">{byStatus.pending.length}</span>
              <div>
                <div className="text-[12px] font-semibold text-amber-700 leading-tight">{admin_t('confessions_pending_badge')}</div>
                <div className="text-[11px] text-amber-500">{admin_t('click_to_view_arrow')} →</div>
              </div>
            </div>
          )}
        </div>

        {/* Show DB error if any */}
        {confErr && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
            ⚠️ {admin_t('db_error_label')} {confErr.message}
            {confErr.message.includes('does not exist') && (
              <span className="block mt-1 text-[12px]">
                {admin_t('confessions_table_missing')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── STATS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { key: 'all',      label: admin_t('confessions_total_label'), count: all.length,                borderColor: 'border-l-gold',         numColor: 'text-ink'         },
          { key: 'pending',  label: t('status.pending'),  count: byStatus.pending.length,   borderColor: 'border-l-amber-400',    numColor: 'text-amber-600'   },
          { key: 'approved', label: t('status.approved'), count: byStatus.approved.length,  borderColor: 'border-l-emerald-400',  numColor: 'text-emerald-600' },
          { key: 'rejected', label: t('status.rejected'), count: byStatus.rejected.length,  borderColor: 'border-l-red-400',      numColor: 'text-red-500'     },
        ].map((s) => (
          <Link
            key={s.key}
            href={`/admin/confessions?tab=${s.key}`}
            className={`bg-paper border-l-4 ${s.borderColor} shadow-card rounded-xl p-4 hover:shadow-card-hover transition-all ${tab === s.key ? 'ring-1 ring-rose/30 ring-offset-1' : ''}`}
          >
            <div className={`text-[32px] font-bold leading-none mb-1.5 ${s.numColor}`}>{s.count}</div>
            <div className="text-[12px] text-muted font-medium">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* ── TABS ───────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map((tabItem) => (
          <Link
            key={tabItem.key}
            href={`/admin/confessions?tab=${tabItem.key}`}
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[9px] rounded-full border transition-all ${
              tab === tabItem.key
                ? 'bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.28)]'
                : 'bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/35 hover:text-rose'
            }`}
          >
            <span className="text-[11px]">{tabItem.emoji}</span>
            {tabItem.label}
            <span className={`text-[11px] font-bold min-w-[18px] text-center px-1 py-0.5 rounded-full ${
              tab === tabItem.key ? 'bg-white/25 text-white' : 'bg-line text-muted'
            }`}>
              {tabItem.count}
            </span>
          </Link>
        ))}

        {/* Comments toggle */}
        <Link
          href={showComments ? `/admin/confessions?tab=${tab}` : `/admin/confessions?tab=${tab}&comments=1`}
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[9px] rounded-full border transition-all ml-auto ${
            showComments
              ? 'bg-teal text-white border-teal'
              : 'bg-paper text-[#5c4d44] border-line hover:bg-teal-soft hover:border-teal/35 hover:text-teal'
          }`}
        >
          💬 {admin_t('view_comments_btn')}
        </Link>
      </div>

      {/* ── CONFESSION LIST ─────────────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">
            📭
          </div>
          <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{admin_t('no_confessions_heading')}</h3>
          <p className="text-[13.5px] text-muted max-w-[340px] mx-auto leading-relaxed">{EMPTY[tab]}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((confession) => (
            <div
              key={confession.id}
              className="bg-paper border border-line rounded-2xl p-4 sm:p-5 hover:border-rose/20 hover:shadow-sm transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full ${STATUS_BADGE[confession.status] ?? STATUS_BADGE.pending}`}>
                      {t(`status.${confession.status}` as Parameters<typeof t>[0])}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full ${confession.community_scope === 'fko_internal' ? 'bg-rose/10 text-rose border border-rose/20' : 'bg-teal-soft text-teal border border-teal/20'}`}>
                      {confession.community_scope === 'fko_internal' ? tAccess('badge_internal') : tAccess('badge_community')}
                    </span>
                    {confession.comment_count > 0 && (
                      <span className="text-[11px] font-medium px-2 py-[4px] rounded-full bg-line text-muted">
                        💬 {confession.comment_count}
                      </span>
                    )}
                  </div>

                  <h3 className="font-serif font-bold text-[17px] leading-snug mb-1.5 text-ink">
                    {confession.title}
                  </h3>
                  <p className="text-[13px] text-[#5c4d44] leading-relaxed line-clamp-2 mb-2">
                    {confession.content.trimStart().startsWith('<')
                      ? stripHtml(confession.content)
                      : confession.content}
                  </p>

                  <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                    <span>
                      {admin_t('author_label')}{' '}
                      <b className="text-[#5c4d44] font-semibold">
                        {confession.is_anonymous
                          ? generateAnonId(confession.id)
                          : (confession.author_name ?? admin_t('unknown_label'))}
                      </b>
                    </span>
                    <span className="opacity-30">·</span>
                    <span>{fmtDate(confession.created_at)}</span>
                    {confession.rejected_reason && (
                      <>
                        <span className="opacity-30">·</span>
                        <span className="text-red-500">{admin_t('rejection_reason_label')} {confession.rejected_reason}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:flex-col sm:min-w-[120px]">
                  <Link
                    href={`/confessions/${confession.id}`}
                    target="_blank"
                    className="flex-1 sm:flex-none text-center text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all whitespace-nowrap"
                  >
                    👁 {admin_t('action_view')}
                  </Link>

                  {confession.status !== 'approved' && (
                    <form action={approveConfession} className="flex-1 sm:flex-none">
                      <input type="hidden" name="id" value={confession.id} />
                      <button
                        type="submit"
                        className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                      >
                        ✅ {t('approve')}
                      </button>
                    </form>
                  )}

                  {confession.status !== 'rejected' && (
                    <form action={rejectConfession} className="flex-1 sm:flex-none">
                      <input type="hidden" name="id" value={confession.id} />
                      <button
                        type="submit"
                        className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                      >
                        ⏸ {t('reject')}
                      </button>
                    </form>
                  )}

                  <form action={deleteConfession} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={confession.id} />
                    <ConfirmDeleteButton
                      message={admin_t('delete_confession_confirm')}
                      label={`🗑 ${admin_t('delete_btn')}`}
                      className="w-full text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    />
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COMMENTS SECTION ────────────────────────────────────── */}
      {showComments && (
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-serif font-bold text-[22px] tracking-[-0.2px] text-ink">
              💬 {admin_t('recent_comments_heading')}
            </h2>
            <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-line text-muted">
              {recentComments.length}
            </span>
          </div>

          {recentComments.length === 0 ? (
            <div className="bg-paper border border-line rounded-2xl py-10 px-6 text-center">
              <p className="text-[14px] text-muted">{admin_t('no_comments_yet')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentComments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-paper border border-line rounded-xl p-4 flex items-start gap-3 hover:border-rose/20 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {comment.is_anonymous ? (
                        <AnonAvatar size={20} />
                      ) : null}
                      <span className="font-semibold text-[13px] text-ink">
                        {comment.is_anonymous
                          ? generateAnonId(comment.id)
                          : (comment.author_name ?? generateAnonId(comment.id))}
                      </span>
                      <span className="text-[11px] text-muted">{fmtDate(comment.created_at)}</span>
                    </div>
                    <p className="text-[13.5px] text-[#3a2d22] leading-relaxed line-clamp-2">{comment.content}</p>
                    <Link
                      href={`/confessions/${comment.confession_id}`}
                      target="_blank"
                      className="text-[11.5px] text-teal hover:underline mt-0.5 inline-block"
                    >
                      {admin_t('view_confession_link')} →
                    </Link>
                  </div>

                  <form action={adminDeleteConfessionComment} className="flex-none">
                    <input type="hidden" name="id" value={comment.id} />
                    <ConfirmDeleteButton
                      message={admin_t('delete_comment_confirm')}
                      label={`🗑 ${admin_t('delete_btn')}`}
                      className="text-[12px] font-semibold px-3 py-[7px] rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent transition-all whitespace-nowrap"
                    />
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
