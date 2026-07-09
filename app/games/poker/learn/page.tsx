import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import OnboardingProvider from '../_eco/OnboardingProvider'
import OnboardingButton from '../_eco/OnboardingButton'
import { Icon, type IconName, Suit } from '../_eco/icons'
import { PageHeader, Eyebrow, SectionTitle } from '../_eco/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('learn.title')} · ${t('title')}` }
}

// Hand-ranking preview (strongest → weakest), each keyed to the shared hand_name namespace.
const RANKING: { key: string; suit: 's' | 'h' | 'd' | 'c' }[] = [
  { key: 'straight_flush', suit: 's' }, { key: 'four_of_a_kind', suit: 'h' }, { key: 'full_house', suit: 'd' },
  { key: 'flush', suit: 'c' }, { key: 'straight', suit: 's' }, { key: 'three_of_a_kind', suit: 'h' },
  { key: 'two_pair', suit: 'd' }, { key: 'pair', suit: 'c' }, { key: 'high_card', suit: 's' },
]

export default async function PokerLearnPage() {
  const t = await getTranslations('games.poker')

  const surfaces: { href: string; icon: IconName; tone: string; title: string; desc: string; cta: string; badge?: string }[] = [
    { href: '/games/poker/training', icon: 'target', tone: 'emerald', title: t('learn.hub.training_title'), desc: t('learn.hub.training_desc'), cta: t('learn.hub.training_cta'), badge: t('learn.training.badge') },
    { href: '/games/poker/learn/rankings', icon: 'trophy', tone: 'amber', title: t('learn.hub.rankings_title'), desc: t('learn.hub.rankings_desc'), cta: t('learn.hub.rankings_cta') },
    { href: '/games/poker/rules', icon: 'book', tone: 'royal', title: t('learn.hub.rules_title'), desc: t('learn.hub.rules_desc'), cta: t('nav.rules') },
    { href: '/games/poker/glossary', icon: 'list', tone: 'violet', title: t('learn.hub.glossary_title'), desc: t('learn.hub.glossary_desc'), cta: t('nav.glossary') },
  ]

  return (
    <PokerShell>
      <OnboardingProvider />

      <PageHeader
        eyebrow={<Eyebrow icon="graduationCap">{t('nav.learn')}</Eyebrow>}
        icon="graduationCap"
        tone="violet"
        title={t('learn.title')}
        subtitle={t('learn.subtitle')}
      />

      {/* Guided tour hero (violet) */}
      <section className="pk-plum pk-plum-violet pk-portal-on-plum relative overflow-hidden rounded-[20px] p-6 sm:p-8">
        <Icon name="graduationCap" size={180} className="pk-suit-watermark -right-4 -top-8 rotate-6" />
        <div className="relative max-w-xl">
          <span className="pk-badge pk-badge-onplum">
            <Icon name="sparkles" size={13} /> {t('learn.onboarding.badge')}
          </span>
          <h2 className="mt-3 font-serif text-2xl font-bold text-[color:var(--pkp-on-plum)]">{t('learn.hub.onboarding_title')}</h2>
          <p className="mt-1.5 text-[15px] text-[color:var(--pkp-on-plum-2)]">{t('learn.hub.onboarding_desc')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <OnboardingButton mode="open" testId="pk-open-tour" className="pk-btn pk-btn-primary pk-btn-gold">
              <Icon name="play" size={17} /> {t('learn.hub.onboarding_cta')}
            </OnboardingButton>
            <OnboardingButton mode="restart" testId="pk-restart-tour" className="pk-btn pk-btn-onplum-outline pk-btn-onplum">
              <Icon name="refresh" size={16} /> {t('learn.hub.reset_tour')}
            </OnboardingButton>
          </div>
        </div>
      </section>

      {/* Beginner path — surfaces presented as ordered steps. */}
      <section className="mt-8">
        <SectionTitle icon="layers" tone="violet">{t('nav.learn')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {surfaces.map((sf, i) => (
            <Link key={sf.href} href={sf.href} className="pk-card group flex items-start gap-4 p-5">
              <span className="relative shrink-0">
                <span className={`pk-ichip pk-ichip-${sf.tone} flex h-11 w-11`}>
                  <Icon name={sf.icon} size={22} />
                </span>
                <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--pkp-plum)] font-serif text-[11px] font-bold text-[color:var(--pkp-gold-soft)]" aria-hidden>
                  {i + 1}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-serif text-base font-semibold text-[color:var(--pkp-ink)]">{sf.title}</span>
                  {sf.badge && <span className="pk-badge pk-badge-emerald">{sf.badge}</span>}
                </span>
                <span className="mt-1 block text-sm text-[color:var(--pkp-ink-2)]">{sf.desc}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pkp-ruby-ink)] group-hover:underline">
                  {sf.cta} <Icon name="arrowRight" size={15} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Hand-ranking preview */}
      <section className="mt-8">
        <SectionTitle
          icon="trophy"
          tone="amber"
          action={
            <Link href="/games/poker/learn/rankings" className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pkp-ruby-ink)] hover:underline">
              {t('learn.hub.rankings_cta')} <Icon name="chevronRight" size={14} />
            </Link>
          }
        >
          {t('learn.hub.rankings_title')}
        </SectionTitle>
        <ol className="pk-panel grid gap-1 p-3 sm:grid-cols-3">
          {RANKING.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[color:var(--pkp-surface-3)] text-xs font-bold tabular-nums text-[color:var(--pkp-ink-2)]">
                {i + 1}
              </span>
              <Suit suit={r.suit} size={14} className={r.suit === 'h' || r.suit === 'd' ? 'text-[color:var(--pkp-ruby)]' : 'text-[color:var(--pkp-ink)]'} />
              <span className="truncate text-sm text-[color:var(--pkp-ink)]">{t(`hand_name.${r.key}`)}</span>
            </li>
          ))}
        </ol>
      </section>
    </PokerShell>
  )
}
