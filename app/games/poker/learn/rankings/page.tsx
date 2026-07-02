import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../_eco/PokerShell'
import { PokerCard } from '../../_components/cards'
import {
  HAND_RANKING_GUIDE,
  KICKER_EXAMPLE,
  WHEEL_EXAMPLE,
  BOARD_PLAYS_EXAMPLE,
  EXACT_TIE_EXAMPLE,
} from '@/lib/games/poker/learn/handGuide'
import type { Card } from '@/lib/games/poker/types'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('learn.rankings.title')} · ${t('title')}` }
}

// Card component tokens are scoped to `.poker-root` (the dark table). The ecosystem pages are
// light, so supply just the card tokens locally — no need for the whole lounge theme.
const CARD_VARS: CSSProperties = {
  ['--pk-r-card' as string]: '8px',
  ['--pk-shadow-seat' as string]: '0 2px 8px rgba(0,0,0,0.18)',
  ['--pk-gold-soft' as string]: '#e6cf95',
}

function Cards({ cards, w = 34 }: { cards: readonly Card[]; w?: number }) {
  return (
    <span className="inline-flex gap-1" style={CARD_VARS}>
      {cards.map((c) => (
        <PokerCard key={c} card={c} w={w} />
      ))}
    </span>
  )
}

export default async function PokerRankingsPage() {
  const t = await getTranslations('games.poker')

  return (
    <PokerShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">{t('learn.rankings.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('learn.rankings.subtitle')}</p>
        </div>
        <Link href="/games/poker/learn" className="whitespace-nowrap text-sm text-rose hover:underline">
          {t('learn.training.back_to_learn')}
        </Link>
      </div>

      <p className="mb-4 rounded-lg bg-rose/5 px-4 py-2 text-sm text-rose">{t('learn.rankings.order_note')}</p>

      <ol data-testid="pk-rankings" className="space-y-2">
        {HAND_RANKING_GUIDE.map((ex, i) => (
          <li key={ex.key} className="flex items-center gap-4 rounded-xl border border-line bg-paper p-4">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-rose/10 text-xs font-bold text-rose">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t(`hand_name.${ex.key}`)}</p>
            </div>
            <Cards cards={ex.cards} />
          </li>
        ))}
      </ol>

      {/* Special cases — do NOT oversimplify these */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-serif text-base font-semibold">{t('learn.rankings.kicker_title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('learn.rankings.kicker_desc')}</p>
          <div className="mt-3 flex items-center gap-3">
            <Cards cards={KICKER_EXAMPLE.a} w={30} />
            <span className="text-xs font-semibold uppercase text-rose">{t('learn.rankings.beats')}</span>
            <Cards cards={KICKER_EXAMPLE.b} w={30} />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-serif text-base font-semibold">{t('learn.rankings.wheel_title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('learn.rankings.wheel_desc')}</p>
          <div className="mt-3">
            <Cards cards={WHEEL_EXAMPLE.cards} w={30} />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-serif text-base font-semibold">{t('learn.rankings.board_plays_title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('learn.rankings.board_plays_desc')}</p>
          <div className="mt-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t('learn.training.board')}</p>
            <Cards cards={BOARD_PLAYS_EXAMPLE.board} w={30} />
            <div className="mt-2 flex items-center gap-3">
              <Cards cards={BOARD_PLAYS_EXAMPLE.holeA} w={26} />
              <span className="text-xs font-semibold uppercase text-muted">=</span>
              <Cards cards={BOARD_PLAYS_EXAMPLE.holeB} w={26} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-serif text-base font-semibold">{t('learn.rankings.exact_tie_title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('learn.rankings.exact_tie_desc')}</p>
          <div className="mt-3 flex items-center gap-3">
            <Cards cards={EXACT_TIE_EXAMPLE.a} w={26} />
            <span className="text-xs font-semibold uppercase text-muted">=</span>
            <Cards cards={EXACT_TIE_EXAMPLE.b} w={26} />
          </div>
        </section>
      </div>

      <p className="mt-6 text-sm text-muted">
        {t('rules.more_in_glossary')}{' '}
        <Link href="/games/poker/glossary" className="text-rose hover:underline">
          {t('nav.glossary')}
        </Link>
      </p>
    </PokerShell>
  )
}
