import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadRiskReviewQueue } from '../integrity-data'

export const metadata = { title: 'Admin · Poker Integrity' }
export const dynamic = 'force-dynamic'

const BAND_CLASS: Record<string, string> = {
  high: 'text-red-600 font-bold',
  medium: 'text-amber-700 font-semibold',
  low: 'text-muted',
  none: 'text-muted',
}

export default async function AdminPokerIntegrity() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const cases = await loadRiskReviewQueue()

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-5">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('nav_integrity')}</h1>
        <p className="text-[13px] text-muted">{t('integrity_sub')}</p>
        <p className="text-[12px] text-amber-700 mt-1">{t('integrity_disclaimer')}</p>
        <p className="text-[11px] text-muted mt-1">{t('integrity_derived_note')}</p>
      </div>

      {cases.length === 0 ? (
        <p className="text-[12px] text-muted">{t('integrity_none')}</p>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div key={c.dedupKey} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className={`text-[18px] tabular-nums ${BAND_CLASS[c.band]}`}>{c.score}</span>
                <span className={`text-[12px] ${BAND_CLASS[c.band]}`}>{t(`band_${c.band}` as 'band_none')}</span>
                <span className="text-[12px] text-muted">{t('col_confidence')}: {(c.confidence * 100).toFixed(0)}%</span>
                <span className="text-[12px] text-muted">{t('col_window')}: {c.windowHands}</span>
                <span className="font-mono text-[12px] text-ink">
                  {c.subjectUserIds.map((u) => u.slice(0, 8)).join(' ⇄ ')}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {t('col_categories')}: {c.categories.join(', ')}
              </div>
              <ul className="mt-2 space-y-1">
                {c.contributingSignals.map((s, i) => (
                  <li key={i} className="text-[12px] flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-ink">{s.code}</span>
                    <span className="tabular-nums text-rose">+{s.contribution}</span>
                    <span className="text-muted">
                      ({(s.severity * 100).toFixed(0)}% × {(s.confidence * 100).toFixed(0)}%)
                    </span>
                    <span className="text-muted">{s.reasons.join(', ')}</span>
                    <span className="text-muted font-mono">
                      {Object.entries(s.evidence).map(([k, v]) => `${k}=${v}`).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
