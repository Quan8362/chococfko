'use client'

// Closed-Beta terms acknowledgement gate. Shown to an enrolled cohort member (admin or not)
// who has NOT yet accepted the current terms version. The server keeps create/join blocked
// (checkPokerCapability → poker_beta_terms_required) until acceptance succeeds; this component
// is the reachable path to accept. On success it refreshes so the server re-resolves the gate
// and the normal poker UI unlocks. Declining leaves poker (the tester cannot play without
// accepting). Acceptance persists in poker_beta_acknowledgements (survives reload).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { acknowledgePokerBetaTerms } from '../beta-actions'

export default function PokerTermsGate({ version }: { version: number }) {
  const t = useTranslations('games.poker.beta.terms')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const accept = () => {
    setError(null)
    start(async () => {
      const res = await acknowledgePokerBetaTerms(locale)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  const decline = () => router.push('/games')

  const bullets = ['b_playmoney', 'b_reset', 'b_bugs', 'b_private', 'b_fair'] as const

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-700">
        {t('badge')}
      </div>
      <h1 className="font-serif text-2xl font-bold text-ink">{t('gate_title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('gate_intro')}</p>

      <ul className="mt-4 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-ink">
            <span className="mt-0.5 text-rose" aria-hidden>•</span>
            <span>{t(b)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted">{t('version', { v: version })}</p>

      {error && <p className="mt-3 text-sm text-rose">{t('accept_error')}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-rose px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t('accepting') : t('accept')}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg border border-line px-6 py-3 font-medium text-ink hover:bg-cream disabled:opacity-60"
        >
          {t('decline')}
        </button>
      </div>
    </section>
  )
}
