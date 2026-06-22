import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { getJp60Stats } from '../stats-actions'
import { JP60_ACHIEVEMENTS } from '@/lib/games/jp60/achievements'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.jp60')
  return { title: `${t('stats_title')} · ${t('meta_title')}` }
}

export default async function StatsPage() {
  const t = await getTranslations('games.jp60')
  const s = await getJp60Stats()

  if (!s.signedIn) {
    return (
      <div className="max-w-[640px] mx-auto px-5 py-16 text-center">
        <h1 className="font-serif font-bold text-[22px] text-ink mb-3">{t('stats_title')}</h1>
        <p className="text-muted mb-5">{t('stats_sign_in')}</p>
        <Link href="/login" className="inline-block px-5 py-2.5 rounded-lg bg-rose text-white font-semibold">{t('result_sign_in')}</Link>
      </div>
    )
  }

  const owned = new Map(s.unlockedAchievements.map((a) => [a.code, a.unlockedAt]))

  return (
    <div className="max-w-[680px] mx-auto px-5 sm:px-6 py-8 pb-20">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif font-bold text-[24px] text-ink">{t('stats_title')}</h1>
        <Link href="/games/japanese-60" className="text-[13px] text-rose font-semibold hover:underline">{t('play_now')}</Link>
      </div>

      {/* level + xp */}
      <div className="bg-paper border border-line rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-serif font-bold text-[18px] text-ink">{t('stats_level')} {s.level}</span>
          <span className="text-[13px] text-muted">{t('stats_next_level_in', { xp: s.xpForNextLevel - s.xpIntoLevel })}</span>
        </div>
        <div className="h-2.5 rounded-full bg-line overflow-hidden">
          <div className="h-full bg-gradient-to-r from-rose to-gold rounded-full" style={{ width: `${Math.round(s.progress * 100)}%` }} />
        </div>
      </div>

      {/* core grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Stat label={t('stats_games')} value={s.totalGames} />
        <Stat label={t('stats_questions')} value={s.totalQuestions} />
        <Stat label={t('stats_accuracy')} value={`${s.accuracy}%`} />
        <Stat label={t('stats_best_score')} value={s.bestScore} />
        <Stat label={t('stats_best_combo')} value={`×${s.bestCombo}`} />
        <Stat label={t('stats_streak')} value={s.streakCurrent} />
      </div>

      {/* category accuracy */}
      <h2 className="text-[13px] font-bold text-ink mb-2">{t('stats_by_category')}</h2>
      <div className="space-y-2 mb-6">
        {(['vocabulary', 'kanji', 'grammar'] as const).map((c) => (
          <div key={c} className="flex items-center gap-3">
            <span className="text-[13px] text-muted w-20 shrink-0">{t(`cat_${c}`)}</span>
            <div className="flex-1 h-2.5 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-teal rounded-full" style={{ width: `${s.categoryAccuracy[c]}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-ink tabular-nums w-10 text-right">{s.categoryAccuracy[c]}%</span>
          </div>
        ))}
      </div>

      {/* achievements */}
      <h2 className="text-[13px] font-bold text-ink mb-2">{t('stats_achievements')} ({s.unlockedAchievements.length}/{JP60_ACHIEVEMENTS.length})</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {JP60_ACHIEVEMENTS.map((a) => {
          const got = owned.has(a.code)
          return (
            <div key={a.code} className={`border rounded-xl p-3 ${got ? 'bg-gold/5 border-gold/30' : 'bg-paper border-line opacity-60'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden className={got ? '' : 'grayscale'}>{a.icon}</span>
                <span className="text-[12.5px] font-bold text-ink leading-tight">{t(`ach.${a.code}.title`)}</span>
              </div>
              <p className="text-[11px] text-muted leading-tight">{t(`ach.${a.code}.desc`)}</p>
            </div>
          )
        })}
      </div>

      {/* weak items */}
      {s.weakItems.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-ink mb-2">{t('stats_weak')}</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {s.weakItems.map((w, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 bg-rose/5 border border-rose/20 rounded-full px-3 py-1.5 text-[12.5px] text-ink">
                {w.questionText || w.sourceId} <span className="text-rose font-bold">×{w.wrong}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* recent */}
      {s.recent.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-ink mb-2">{t('stats_recent')}</h2>
          <div className="bg-paper border border-line rounded-2xl divide-y divide-line/50">
            {s.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="text-ink">{t(`mode_${r.mode}`)} · {r.level === 'MIXED' ? t('level_mixed') : r.level}</span>
                <span className="font-bold text-rose tabular-nums">{r.score} <span className="text-muted font-normal">({r.accuracy}%)</span></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-paper border border-line rounded-xl p-3 text-center">
      <p className="text-[11px] text-muted mb-0.5">{label}</p>
      <p className="text-[20px] font-bold text-ink tabular-nums">{value}</p>
    </div>
  )
}
