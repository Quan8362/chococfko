import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import PokerMissionPing from '../_components/PokerMissionPing'
import { markRulesReviewed } from '../social'
import { Icon, type IconName, Suit } from '../_eco/icons'
import { PageHeader, Eyebrow, SectionTitle, type Tone } from '../_eco/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('rules.title')} · ${t('title')}` }
}

const SECTIONS: { key: string; icon: IconName; tone: Tone }[] = [
  { key: 'objective', icon: 'target', tone: 'ruby' },
  { key: 'blinds', icon: 'coins', tone: 'amber' },
  { key: 'betting', icon: 'layers', tone: 'emerald' },
  { key: 'streets', icon: 'list', tone: 'royal' },
  { key: 'showdown', icon: 'eye', tone: 'violet' },
  { key: 'allin', icon: 'flame', tone: 'coral' },
  { key: 'etiquette', icon: 'shield', tone: 'gold' },
]

const RANKING = ['straight_flush', 'four_of_a_kind', 'full_house', 'flush', 'straight', 'three_of_a_kind', 'two_pair', 'pair', 'high_card'] as const

// Betting-round timeline: community cards dealt at each street.
const TIMELINE: { key: string; label: (t: (k: string) => string) => string; cards: number }[] = [
  { key: 'preflop', label: (t) => t('rules.preflop'), cards: 0 },
  { key: 'flop', label: (t) => t('glossary.label.flop'), cards: 3 },
  { key: 'turn', label: (t) => t('glossary.label.turn'), cards: 1 },
  { key: 'river', label: (t) => t('glossary.label.river'), cards: 1 },
  { key: 'showdown', label: (t) => t('glossary.label.showdown'), cards: 0 },
]

export default async function PokerRulesPage() {
  const t = await getTranslations('games.poker')

  return (
    <PokerShell>
      <PokerMissionPing action={markRulesReviewed} />
      <PageHeader
        eyebrow={<Eyebrow icon="book">{t('nav.rules')}</Eyebrow>}
        icon="book"
        tone="royal"
        title={t('rules.title')}
        subtitle={t('rules.intro')}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Contents nav */}
        <nav aria-label={t('rules.contents')} className="lg:sticky lg:top-28 lg:self-start">
          <p className="pk-eyebrow mb-2 hidden lg:flex">{t('rules.contents')}</p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map((s) => (
              <li key={s.key} className="shrink-0">
                <a
                  href={`#rule-${s.key}`}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-[color:var(--pkp-ink-2)] transition-colors hover:bg-[color:var(--pkp-surface-2)] hover:text-[color:var(--pkp-ink)]"
                >
                  <Icon name={s.icon} size={15} style={{ color: s.tone === 'gold' ? 'var(--pkp-gold-deep)' : `var(--pkp-${s.tone}-ink)` }} />
                  {t(`rules.s_${s.key}_t`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Chapters */}
        <div className="min-w-0">
          {/* Timeline */}
          <section className="pk-panel pk-hairline-gold mb-5 p-5">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
              <span className="pk-ichip pk-ichip-royal h-7 w-7"><Icon name="clock" size={15} /></span>
              {t('rules.timeline_title')}
            </h2>
            <ol className="flex items-stretch gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              {TIMELINE.map((step, i) => (
                <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
                  <div className="flex min-w-[92px] flex-1 flex-col items-center rounded-xl bg-[color:var(--pkp-surface-2)] px-2 py-3 text-center">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--pkp-plum)] text-[11px] font-bold text-[color:var(--pkp-gold-soft)]">{i + 1}</span>
                    <span className="mt-1.5 text-sm font-semibold text-[color:var(--pkp-ink)]">{step.label(t)}</span>
                    <span className="mt-1 flex h-3 items-center gap-0.5" aria-hidden>
                      {step.cards > 0
                        ? Array.from({ length: step.cards }).map((_, k) => (
                            <span key={k} className="h-3 w-2 rounded-[2px] border border-[color:var(--pkp-gold-line)] bg-[color:var(--pkp-surface)]" />
                          ))
                        : <span className="text-[10px] text-[color:var(--pkp-ink-3)]">—</span>}
                    </span>
                  </div>
                  {i < TIMELINE.length - 1 && <Icon name="chevronRight" size={16} className="shrink-0 text-[color:var(--pkp-ink-3)]" />}
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-4">
            {SECTIONS.map((s) => (
              <section
                key={s.key}
                id={`rule-${s.key}`}
                className="pk-panel scroll-mt-28 p-5"
                style={{ borderLeft: `3px solid var(--pkp-${s.tone === 'gold' ? 'gold' : s.tone})` }}
              >
                <h2 className="flex items-center gap-2 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
                  <span className={`pk-ichip pk-ichip-${s.tone} h-7 w-7`}><Icon name={s.icon} size={15} /></span>
                  {t(`rules.s_${s.key}_t`)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--pkp-ink-2)]">{t(`rules.s_${s.key}_b`)}</p>
              </section>
            ))}
          </div>

          {/* Hand ranking */}
          <section className="mt-5">
            <SectionTitle icon="trophy" tone="amber">{t('rules.hand_ranking_title')}</SectionTitle>
            <ol className="pk-panel grid gap-1 p-3 sm:grid-cols-2">
              {RANKING.map((r, i) => (
                <li key={r} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[color:var(--pkp-surface-3)] text-xs font-bold tabular-nums text-[color:var(--pkp-ink-2)]">{i + 1}</span>
                  <Suit suit={i % 2 === 0 ? 's' : 'h'} size={13} className={i % 2 === 0 ? 'text-[color:var(--pkp-ink)]' : 'text-[color:var(--pkp-ruby)]'} />
                  <span className="text-sm text-[color:var(--pkp-ink)]">{t(`hand_name.${r}`)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Related */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/games/poker/learn" className="pk-btn pk-btn-secondary">
              <Icon name="graduationCap" size={16} /> {t('nav.learn')}
            </Link>
            <Link href="/games/poker/glossary" className="pk-btn pk-btn-secondary">
              <Icon name="list" size={16} /> {t('nav.glossary')}
            </Link>
          </div>
        </div>
      </div>
    </PokerShell>
  )
}
