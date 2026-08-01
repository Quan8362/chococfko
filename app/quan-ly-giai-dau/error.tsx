'use client'

import { useTranslations } from 'next-intl'
import TournamentShell from '@/components/tournaments/TournamentShell'
import ManagementIcon from '@/components/tournaments/management/ManagementIcon'

export default function ManagementListError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('tournament_management')

  return (
    <TournamentShell size="wide">
      <div className="rounded-2xl border border-red-200 bg-paper px-6 py-14 text-center shadow-[0_4px_20px_rgba(36,26,23,0.04)] sm:px-8 sm:py-16">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-red-200 bg-red-50 text-red-600">
          <ManagementIcon name="reset" className="h-7 w-7" />
        </div>
        <h1 className="mb-2 font-serif text-[20px] font-bold text-ink">{t('error_title')}</h1>
        <p className="mx-auto mb-6 max-w-[440px] text-[13.5px] leading-relaxed text-muted">{t('error_sub')}</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-2"
        >
          <ManagementIcon name="reset" className="h-4 w-4" />
          {t('retry')}
        </button>
      </div>
    </TournamentShell>
  )
}
