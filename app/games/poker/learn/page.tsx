import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import OnboardingProvider from '../_eco/OnboardingProvider'
import OnboardingButton from '../_eco/OnboardingButton'

// Dynamic like every gated poker route (the layout gates on getPokerAccess()).
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('learn.title')} · ${t('title')}` }
}

export default async function PokerLearnPage() {
  const t = await getTranslations('games.poker')

  return (
    <PokerShell>
      {/* First-time tour overlay (auto-shows only for eligible players). */}
      <OnboardingProvider />

      <h1 className="font-serif text-2xl font-bold">{t('learn.title')}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t('learn.subtitle')}</p>

      {/* Guided tour CTA */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#1b1230] to-[#2a1a3e] p-6 text-white">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          {t('learn.onboarding.badge')}
        </p>
        <h2 className="font-serif text-xl font-bold">{t('learn.hub.onboarding_title')}</h2>
        <p className="mt-1 max-w-lg text-white/80">{t('learn.hub.onboarding_desc')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <OnboardingButton
            mode="open"
            testId="pk-open-tour"
            className="inline-flex items-center justify-center rounded-lg bg-rose px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            {t('learn.hub.onboarding_cta')}
          </OnboardingButton>
          <OnboardingButton
            mode="restart"
            testId="pk-restart-tour"
            className="inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-2.5 font-medium text-white hover:bg-white/10"
          >
            {t('learn.hub.reset_tour')}
          </OnboardingButton>
        </div>
      </section>

      {/* Learning surfaces */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/games/poker/training" className="group rounded-xl border border-line bg-paper p-5 hover:border-rose">
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-rose/10 text-lg text-rose">♣</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
              {t('learn.training.badge')}
            </span>
          </div>
          <h3 className="font-serif text-base font-semibold">{t('learn.hub.training_title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('learn.hub.training_desc')}</p>
          <p className="mt-3 text-sm font-medium text-rose group-hover:underline">{t('learn.hub.training_cta')} →</p>
        </Link>

        <Link href="/games/poker/learn/rankings" className="group rounded-xl border border-line bg-paper p-5 hover:border-rose">
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-rose/10 text-lg text-rose" aria-hidden>♠</div>
          <h3 className="font-serif text-base font-semibold">{t('learn.hub.rankings_title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('learn.hub.rankings_desc')}</p>
          <p className="mt-3 text-sm font-medium text-rose group-hover:underline">{t('learn.hub.rankings_cta')} →</p>
        </Link>

        <Link href="/games/poker/rules" className="group rounded-xl border border-line bg-paper p-5 hover:border-rose">
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-rose/10 text-lg text-rose" aria-hidden>♥</div>
          <h3 className="font-serif text-base font-semibold">{t('learn.hub.rules_title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('learn.hub.rules_desc')}</p>
          <p className="mt-3 text-sm font-medium text-rose group-hover:underline">{t('nav.rules')} →</p>
        </Link>

        <Link href="/games/poker/glossary" className="group rounded-xl border border-line bg-paper p-5 hover:border-rose">
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-rose/10 text-lg text-rose" aria-hidden>♦</div>
          <h3 className="font-serif text-base font-semibold">{t('learn.hub.glossary_title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('learn.hub.glossary_desc')}</p>
          <p className="mt-3 text-sm font-medium text-rose group-hover:underline">{t('nav.glossary')} →</p>
        </Link>
      </section>
    </PokerShell>
  )
}
