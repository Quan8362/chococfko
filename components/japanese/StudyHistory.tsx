import { getTranslations, getLocale } from 'next-intl/server'
import type { StudySessionRecord } from '@/app/tieng-nhat/bookmark-actions'
import JlptBadge from './JlptBadge'

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m${s}s` : `${m}m`
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type Props = { sessions: StudySessionRecord[] }

export default async function StudyHistory({ sessions }: Props) {
  const [t, locale] = await Promise.all([getTranslations('japanese'), getLocale()])

  const typeLabel: Record<string, string> = {
    quiz: t('session_quiz'),
    exam: t('session_exam'),
    flashcard: t('session_flashcard'),
  }

  return (
    <div>
      {sessions.length === 0 ? (
        <p className="text-[14px] text-muted text-center py-10">{t('no_sessions')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map(s => {
            const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0
            return (
              <div key={s.id} className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-ink">
                      {typeLabel[s.sessionType] ?? s.sessionType}
                    </span>
                    <JlptBadge level={s.level} />
                    <span className="text-[11px] text-muted">{formatDate(s.createdAt, locale)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-[13px] font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose'}`}>
                      {s.score}/{s.total} ({pct}%)
                    </span>
                    {s.durationSec > 0 && (
                      <span className="text-[12px] text-muted">{formatDuration(s.durationSec)}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
