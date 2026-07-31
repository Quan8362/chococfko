'use client'

import { useTranslations } from 'next-intl'

// Route-level error boundary for the public tournament pages. Renders a friendly, translated retry
// panel instead of leaking any internal error to Guests.
export default function TournamentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('tournaments')
  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-20 text-center">
      <div className="bg-cream border border-line rounded-2xl py-14 px-6">
        <p className="text-[15px] font-semibold text-ink mb-1">{t('public.error_title')}</p>
        <p className="text-[13.5px] text-muted max-w-[380px] mx-auto mb-5">{t('public.error_desc')}</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-rose hover:bg-rose/90 px-4 py-2 rounded-xl transition-colors"
        >
          {t('public.retry')}
        </button>
      </div>
    </div>
  )
}
