'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface ResultSummaryProps {
  score: number
  total: number
  durationSec: number
  onRetry?: () => void
  backHref?: string
  backLabel?: string
  isLoggedIn: boolean
  isSaving: boolean
  isSaved: boolean | null
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

export default function ResultSummary({
  score,
  total,
  durationSec,
  onRetry,
  backHref,
  backLabel,
  isLoggedIn,
  isSaving,
  isSaved,
}: ResultSummaryProps) {
  const t = useTranslations('japanese')
  const pct = total > 0 ? Math.round((score / total) * 100) : 0

  const gradeColor =
    pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'
  const gradeEmoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚'

  return (
    <div className="text-center">
      <div className="text-[56px] leading-none mb-4">{gradeEmoji}</div>
      <h2 className={`font-serif font-bold text-[40px] mb-1 ${gradeColor}`}>{pct}%</h2>
      <p className="text-[14.5px] text-muted mb-8">{t('result_heading')}</p>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-green-50 border border-green-100 rounded-2xl py-4 px-2">
          <div className="font-bold text-[22px] text-green-700">{score}</div>
          <div className="text-[11px] text-green-600 mt-0.5 leading-tight">{t('correct_count')}</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl py-4 px-2">
          <div className="font-bold text-[22px] text-red-600">{total - score}</div>
          <div className="text-[11px] text-red-500 mt-0.5 leading-tight">{t('wrong_count')}</div>
        </div>
        <div className="bg-cream border border-line rounded-2xl py-4 px-2">
          <div className="font-bold text-[18px] text-ink">{formatDuration(durationSec)}</div>
          <div className="text-[11px] text-muted mt-0.5 leading-tight">{t('duration')}</div>
        </div>
      </div>

      {/* Save status */}
      {!isLoggedIn && (
        <p className="text-[12.5px] text-muted mb-5">{t('login_to_save_result')}</p>
      )}
      {isSaving && (
        <p className="text-[12.5px] text-muted mb-5">{t('loading')}…</p>
      )}
      {isSaved === true && (
        <p className="text-[12.5px] text-green-600 mb-5">✓ {t('result_saved')}</p>
      )}
      {isSaved === false && (
        <p className="text-[12.5px] text-red-500 mb-5">✗ {t('result_save_failed')}</p>
      )}

      <div className="flex justify-center gap-3 flex-wrap">
        {onRetry && (
          <button
            onClick={onRetry}
            className="bg-rose text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
          >
            {t('try_again')}
          </button>
        )}
        {backHref && (
          <Link
            href={backHref}
            className="bg-paper border border-line text-ink font-semibold text-[14px] px-6 py-3 rounded-xl hover:border-rose/30 transition-colors"
          >
            ← {backLabel ?? t('back_to_quiz')}
          </Link>
        )}
      </div>
    </div>
  )
}
