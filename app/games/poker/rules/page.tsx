import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'

// Must render per-request: the poker layout gates on getPokerAccess() (POKER_ENABLED / admin
// cookie). A force-static prerender bakes the build-time gate result (feature OFF ⇒ notFound),
// which would 404 this page for admins and after a flag-flip until a rebuild. Dynamic like every
// other gated poker route.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('rules.title')} · ${t('title')}` }
}

const SECTIONS = ['objective', 'blinds', 'betting', 'streets', 'showdown', 'allin', 'etiquette'] as const
const RANKING = [
  'straight_flush', 'four_of_a_kind', 'full_house', 'flush', 'straight', 'three_of_a_kind', 'two_pair', 'pair', 'high_card',
] as const

export default async function PokerRulesPage() {
  const t = await getTranslations('games.poker')
  return (
    <PokerShell>
      <h1 className="font-serif text-2xl font-bold">{t('rules.title')}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t('rules.intro')}</p>

      <div className="mt-6 space-y-4">
        {SECTIONS.map((s) => (
          <section key={s} className="rounded-xl border border-line bg-paper p-5">
            <h2 className="font-serif text-base font-semibold">{t(`rules.s_${s}_t`)}</h2>
            <p className="mt-1 text-sm text-muted">{t(`rules.s_${s}_b`)}</p>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-line bg-paper p-5">
        <h2 className="font-serif text-base font-semibold">{t('rules.hand_ranking_title')}</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {RANKING.map((r, i) => (
            <li key={r} className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded bg-rose/10 text-xs text-rose">{i + 1}</span>
              {t(`hand_name.${r}`)}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-6 text-sm text-muted">
        {t('rules.more_in_glossary')}{' '}
        <Link href="/games/poker/glossary" className="text-rose hover:underline">
          {t('nav.glossary')}
        </Link>
      </p>
    </PokerShell>
  )
}
