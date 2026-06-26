import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAllBookmarks, getStudySessions, getReviewItems } from '../bookmark-actions'
import StatCard from '@/components/japanese/StatCard'
import BookmarkList from '@/components/japanese/BookmarkList'
import StudyHistory from '@/components/japanese/StudyHistory'
import ReviewList from '@/components/japanese/ReviewList'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('profile_heading')}` }
}

export default async function StudyProfilePage() {
  const t = await getTranslations('japanese')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-20 pb-32 text-center">
        <div className="text-5xl mb-6">📊</div>
        <h1 className="font-serif font-bold text-[26px] text-ink mb-3">{t('profile_heading')}</h1>
        <p className="text-[15px] text-muted mb-8">{t('login_required_profile')}</p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
        >
          {t('login_to_use')}
        </Link>
      </div>
    )
  }

  const [bookmarks, sessions, reviewItems, bmCount] = await Promise.all([
    getAllBookmarks(),
    getStudySessions(20),
    getReviewItems(),
    supabase
      .from('jp_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(r => r.count ?? 0),
  ])

  const totalSessions = sessions.length
  const avgScore = totalSessions > 0
    ? Math.round(sessions.filter(s => s.total > 0).reduce((acc, s) => acc + (s.score / s.total * 100), 0) / totalSessions)
    : 0

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/japanese" className="text-[13px] text-muted hover:text-rose transition-colors">
            {t('nav')}
          </Link>
          <span className="text-muted/40">/</span>
          <span className="text-[13px] text-ink">{t('profile_heading')}</span>
        </div>
        <h1 className="font-serif font-bold text-[28px] sm:text-[34px] text-ink">{t('profile_heading')}</h1>
      </div>

      {/* Stats */}
      <section className="mb-10">
        <h2 className="font-serif font-bold text-[17px] text-ink mb-4">{t('profile_overview')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t('stat_total_saved')} value={bmCount} accent />
          <StatCard label={t('stat_total_sessions')} value={totalSessions} />
          <StatCard label={t('stat_avg_score')} value={totalSessions > 0 ? `${avgScore}%` : '—'} />
          <StatCard label={t('stat_review_count')} value={reviewItems.length} />
        </div>
      </section>

      {/* Saved items */}
      <section className="mb-10">
        <h2 className="font-serif font-bold text-[17px] text-ink mb-4">{t('profile_saved_items')}</h2>
        <BookmarkList bookmarks={bookmarks} />
      </section>

      {/* Review items */}
      {reviewItems.length > 0 && (
        <section className="mb-10">
          <h2 className="font-serif font-bold text-[17px] text-ink mb-4">{t('profile_need_review')}</h2>
          <ReviewList items={reviewItems} />
        </section>
      )}

      {/* Study history */}
      <section>
        <h2 className="font-serif font-bold text-[17px] text-ink mb-4">{t('profile_study_history')}</h2>
        <StudyHistory sessions={sessions} />
      </section>
    </div>
  )
}
